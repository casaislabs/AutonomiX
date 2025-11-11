import type { Express, Request, Response, NextFunction } from 'express'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { origin } from '../config.js'

export function applySecurity(app: Express): Express {
  const isDev = process.env.NODE_ENV !== 'production'
  // Trust proxy when running behind reverse proxy (needed for correct IP, HSTS)
  app.set('trust proxy', true)

  // Route-specific CORS:
  // - Public: allow any origin without credentials for read endpoints (agents/metadata/health)
  // - Private: restrict to allowed origins with credentials for /api/*
  const allowedOrigins = [origin, 'http://localhost:5173'].filter(Boolean)
  const corsOrigin = isDev
    ? true
    : (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!requestOrigin) return callback(null, false)
        const allow = allowedOrigins.includes(requestOrigin)
        callback(null, allow)
      }
  const publicCors = cors({ origin: '*', credentials: false, methods: ['GET', 'OPTIONS'] })
  const privateCors = cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
  // Public routes (read-only)
  app.use('/health', publicCors)
  app.use('/agents', publicCors)
  app.use('/images', publicCors)
  app.use('/metadata', publicCors)
  // Private routes (with credentials)
  app.use('/api', privateCors)
  // Explicit preflight handling for all /api subpaths using a RegExp
  // Matches "/api" and any subroute (e.g. /api/v1/foo)
  app.options(/^\/api(?:\/|$)/, privateCors)

  // Helmet: enable core protections; add HSTS/CSP in production
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      // Content Security Policy tuned for this API (only self by default)
      contentSecurityPolicy: isDev
        ? false
        : {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", ...allowedOrigins],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
            },
          },
      hsts: isDev ? false : { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
  )

  // JSON body parser with sane limit
  const jsonLimit = process.env.JSON_LIMIT || '1mb'
  app.use(express.json({ limit: jsonLimit }))

  // Simple in-memory rate limiter (per IP)
  const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 60)
  const buckets = new Map<string, { count: number; ts: number }>()
  function rateLimit(req: Request, res: Response, next: NextFunction) {
    try {
      const key = (req.ip || 'unknown') + ':' + (req.path || '/')
      const now = Date.now()
      const state = buckets.get(key)
      if (!state || now - state.ts > 60_000) {
        buckets.set(key, { count: 1, ts: now })
        return next()
      }
      if (state.count >= RATE_LIMIT_PER_MIN) {
        res.status(429).json({ error: 'Too Many Requests' })
        return
      }
      state.count++
      next()
    } catch {
      next()
    }
  }
  app.use(rateLimit)


  return app
}