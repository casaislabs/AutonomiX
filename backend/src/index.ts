import express from 'express';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { port, imagesDir, metadataDir } from './config.js';
import { applySecurity } from './middleware/security.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerMetadataRoutes } from './routes/metadata.js';
import { paymentMiddleware } from 'x402-express';
import { X402_RECEIVER_ADDRESS, X402_NETWORK, X402_PRICE_USD, X402_FACILITATOR_URL } from './config.js';
// Explicit dev-time registration of agent endpoints to avoid dynamic import issues
import { registerAgent1Endpoint } from './routes/endpoint/agent1.js';
import { registerAgent2Endpoint } from './routes/endpoint/agent2.js';
import { registerAgent3Endpoint } from './routes/endpoint/agent3.js';

// Hardening: ensure Node's global fetch uses identity encoding for outbound requests
// Preserve original headers; stabilize facilitator requests to avoid length mismatches.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input: any, init?: any) => {
  try {
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    const originalHeaders = init?.headers;
    const headers = new Headers(originalHeaders ?? undefined);
    if (!headers.has('accept-encoding')) {
      headers.set('accept-encoding', 'identity');
    }
    const method = String((init?.method ?? 'GET')).toUpperCase();
    const isFacilitator = typeof url === 'string' && /x402\.org\/facilitator/i.test(url);
    // When posting JSON to facilitator, ensure deterministic headers and duplex
    if (isFacilitator && method !== 'GET' && typeof init?.body === 'string') {
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      if (!headers.has('content-length')) {
        try {
          const len = Buffer.byteLength(init!.body as string, 'utf8');
          headers.set('content-length', String(len));
        } catch {}
      }
      if (!(init as any)?.duplex) {
        (init as any) = { ...(init || {}), duplex: 'half' };
      }
    }
    const nextInit = { ...(init || {}), headers };
    // Temporary debug logging for facilitator calls
    if (isFacilitator) {
      console.log('[x402] Facilitator request', {
        url,
        method,
        headers: {
          'accept-encoding': headers.get('accept-encoding') ?? undefined,
          'content-type': headers.get('content-type') ?? undefined,
          'content-length': headers.get('content-length') ?? undefined,
        },
      });
    }
    return originalFetch(input as any, nextInit as any)
      .then((resp: any) => {
        try {
          if (isFacilitator) {
            console.log('[x402] Facilitator response', {
              url,
              status: resp?.status,
              headers: {
                'content-length': resp?.headers?.get?.('content-length'),
                'content-encoding': resp?.headers?.get?.('content-encoding'),
                'content-type': resp?.headers?.get?.('content-type'),
              },
            });
          }
        } catch {}
        return resp;
      })
      .catch((err: any) => {
        try {
          if (isFacilitator) {
            console.log('[x402] Facilitator error', { url, error: String(err?.message || err) });
          }
        } catch {}
        throw err;
      });
  } catch (e) {
    return originalFetch(input as any, init as any);
  }
};
const app = express();
// Centralized security and static handling
applySecurity(app);
// Static assets for metadata and images (ERC-721)
app.use('/images', express.static(imagesDir, { maxAge: '1h', immutable: true }))
app.use('/metadata', express.static(metadataDir, { maxAge: '1h', immutable: true }))
// x402 paywall (USDC) on Base Sepolia protecting GET /api/agent{N} (auto-detected)
type X402Network = 'base' | 'base-sepolia';
function isHexAddress(a: string): a is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}
function hasProtocol(u: string): u is `${string}://${string}` {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/.test(u);
}
async function setupX402ForLocalEndpoints(app: express.Express): Promise<void> {
  const receiverRaw = X402_RECEIVER_ADDRESS;
  if (!isHexAddress(receiverRaw)) {
    console.warn('x402: X402_RECEIVER_ADDRESS invalid or not set; USDC paywall disabled');
    return;
  }
  const resolvedNetwork = (X402_NETWORK as X402Network);
  const receiverAddr: `0x${string}` = receiverRaw as `0x${string}`;
  const facilitatorUrlRaw = X402_FACILITATOR_URL;
  const options = hasProtocol(facilitatorUrlRaw) ? { url: facilitatorUrlRaw } : undefined;
  // Detect agentN.* in routes/endpoint and protect GET /api/agentN
  const distEndpointsDir = path.join(__dirname, 'routes', 'endpoint');
  const srcEndpointsDir = path.join(__dirname, '..', 'src', 'routes', 'endpoint');
  const candidateDirs = [distEndpointsDir, srcEndpointsDir];
  const idSet = new Set<number>();
  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const m = e.name.match(/^agent(\d+)\.[tj]s$/i);
        if (m) {
          const id = Number(m[1]);
          if (Number.isFinite(id) && id > 0) idSet.add(id);
        }
      }
    } catch {
      // continue with next directory
    }
  }

  const protectedRoutes: Record<string, any> = {};
  const ids = Array.from(idSet).sort((a, b) => a - b);
  for (const id of ids) {
    protectedRoutes[`GET /api/agent${id}`] = {
      price: X402_PRICE_USD,
      network: resolvedNetwork,
        config: {
          description: `Local agent ${id} endpoint protected by x402`,
          mimeType: 'application/json',
          outputSchema: {
            type: 'object',
          properties: {
            message: { type: 'string' },
            txHash: { type: 'string' },
            reputation: { type: 'string' },
          },
        },
      },
    };
  }

  // Additional manual routes from env
  const extraPathsRaw = String(process.env.X402_PROTECTED_PATHS || '').trim();
  if (extraPathsRaw) {
    const extraPaths = extraPathsRaw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.startsWith('/'));
    for (const p of extraPaths) {
      protectedRoutes[`GET ${p}`] = {
        price: X402_PRICE_USD,
        network: resolvedNetwork,
        config: {
          description: `Local protected route ${p}`,
          mimeType: 'application/json',
          outputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              txHash: { type: 'string' },
              reputation: { type: 'string' },
            },
          },
        },
      };
    }
  }

  const protectedCount = Object.keys(protectedRoutes).length;
  if (protectedCount === 0) {
    console.warn('x402: No endpoints detected in routes/endpoint or X402_PROTECTED_PATHS; no routes will be protected');
  }
  // Temporary debug logging for /api requests and responses
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      const start = Date.now();
      const xPayment = req.get('X-PAYMENT');
      console.log('[x402] Incoming API request', {
        method: req.method,
        url: req.originalUrl,
        hasXPayment: !!xPayment,
        xPaymentLength: xPayment ? xPayment.length : 0,
      });
      res.on('finish', () => {
        const durationMs = Date.now() - start;
        const headers = res.getHeaders();
        console.log('[x402] API response', {
          status: res.statusCode,
          durationMs,
          'x-payment-request': headers['x-payment-request'],
          'x-payment-response': headers['x-payment-response'],
          'x-payment': headers['x-payment'],
        });
      });
    }
    next();
  });
  app.use(paymentMiddleware(receiverAddr, protectedRoutes, options));
  console.log(`x402 paywall enabled: ${protectedCount} protected routes [${ids.join(', ') || 'none'}], receiver=${receiverAddr}, network=${resolvedNetwork}`);
}

// Auto registration of endpoints in routes/endpoint
async function autoRegisterAgentEndpoints(app: express.Express): Promise<void> {
  const distEndpointsDir = path.join(__dirname, 'routes', 'endpoint');
  const srcEndpointsDir = path.join(__dirname, '..', 'src', 'routes', 'endpoint');
  // In production (running compiled code from dist), avoid importing TS from src
  // to prevent "Unknown file extension .ts" noise in logs.
  const isProduction = process.env.NODE_ENV === 'production' || path.basename(__dirname) === 'dist';
  const candidateDirs = isProduction ? [distEndpointsDir] : [distEndpointsDir, srcEndpointsDir];
  let registered = 0;
  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        // In production, only consider compiled .js files; in dev accept .ts/.js
        const match = isProduction
          ? e.name.match(/^agent(\d+)\.js$/i)
          : e.name.match(/^agent(\d+)\.[tj]s$/i);
        if (!match) continue;
        const absPath = path.join(dir, e.name);
        const fileUrl = pathToFileURL(absPath).href;
        try {
          const mod = await import(fileUrl);
          const exportKeys = Object.keys(mod);
          const fnKey = exportKeys.find(k => /^registerAgent\d+Endpoint$/.test(k));
          if (fnKey && typeof (mod as any)[fnKey] === 'function') {
            (mod as any)[fnKey](app);
            registered++;
          } else if (typeof mod.default === 'function') {
            (mod as any).default(app);
            registered++;
          } else {
            console.warn(`endpoint ${e.name}: no exported registration function found`);
          }
        } catch (err) {
          console.warn(`failed to load ${absPath}:`, (err as any)?.message ?? err);
        }
      }
    } catch {
      // continue with next directory
    }
  }
  console.log(`Endpoint registration completed: ${registered} files registered`);
}

async function bootstrap() {
  await setupX402ForLocalEndpoints(app);
  await autoRegisterAgentEndpoints(app);
  // Manual registration fallback in dev: ensure handlers exist
  try { registerAgent1Endpoint(app); } catch (e: any) { console.warn('manual register agent1 failed:', e?.message || e); }
  try { registerAgent2Endpoint(app); } catch (e: any) { console.warn('manual register agent2 failed:', e?.message || e); }
  try { registerAgent3Endpoint(app); } catch (e: any) { console.warn('manual register agent3 failed:', e?.message || e); }
  // Health routes
  registerHealthRoutes(app);
  // Agent routes (list and detail)
  registerAgentRoutes(app);
  // Detailed metadata route
  registerMetadataRoutes(app);

  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`API at http://${host}:${port}`);
  });
}

void bootstrap();

