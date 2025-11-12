import { useAccount, useChainId, useWalletClient } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { useEffect, useMemo, useState } from 'react'
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch'

// Normalize image URL: ipfs:// → https, relative paths → apiBase + path
function makeImageSrc(apiBase: string, u?: string) {
  if (!u) return undefined
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${u.slice(7)}`
  if (u.startsWith('/')) return `${apiBase}${u}`
  return u
}

export function AgentPanel() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { data: walletClient } = useWalletClient()
  const wrongNetwork = isConnected && chainId !== baseSepolia.id
  
  

  // Backend base URL resolution order:
  // 1) Vite env var (VITE_BACKEND_URL) — production on Vercel
  // 2) window.__BACKEND_URL__ — optional global injection
  // 3) localhost fallback for local dev
  const apiBaseEnv = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined
  const apiBase = useMemo(
    () => apiBaseEnv || (window as any)?.__BACKEND_URL__ || 'http://localhost:3001',
    [apiBaseEnv]
  )
  // Temporary debug log: effective API base
  useEffect(() => {
    console.log('[x402] Frontend config', { apiBase, apiBaseEnv, injected: (window as any)?.__BACKEND_URL__ })
  }, [apiBase, apiBaseEnv])

  // Agents list state
  const [agents, setAgents] = useState<Array<{ id: number; endpoint: string; metadataURI: string; reputation: string; name?: string; description?: string; image?: string; imageDataURI?: string; attributes?: any[] }>>([])
  const [loadingAgents, setLoadingAgents] = useState<boolean>(false)
  const [agentsError, setAgentsError] = useState<string>('')
  const [interact, setInteract] = useState<Record<number, { loading: boolean; error?: string; response?: any; payment?: any }>>({})

  // Simplified view: list only, no selection or details

  useEffect(() => {
    let cancelled = false
    async function loadAgents() {
      setLoadingAgents(true)
      setAgentsError('')
      try {
        console.log('[x402] Fetch agents list', { url: `${apiBase}/agents` })
        const resp = await fetch(`${apiBase}/agents`)
        console.log('[x402] Agents response', { status: resp.status })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        if (!cancelled) setAgents((data.items || []).map((it: any) => ({
          id: Number(it.id),
          endpoint: String(it.endpoint ?? ''),
          metadataURI: String(it.metadataURI ?? ''),
          reputation: String(it.reputation ?? ''),
          ...(typeof it.name === 'string' ? { name: it.name } : {}),
          ...(typeof it.description === 'string' ? { description: it.description } : {}),
          ...(typeof it.image === 'string' ? { image: it.image } : {}),
          ...(typeof it.imageDataURI === 'string' ? { imageDataURI: it.imageDataURI } : {}),
          ...(Array.isArray(it.attributes) ? { attributes: it.attributes.filter((a: any) => String(a?.trait_type || '').toLowerCase() !== 'agent id') } : {}),
        })))
      } catch (e: any) {
        if (!cancelled) setAgentsError(e?.message || 'Failed to load agents')
      } finally {
        if (!cancelled) setLoadingAgents(false)
      }
    }
    loadAgents()
    return () => { cancelled = true }
  }, [apiBase])

  // No details effect

  async function refreshAgent(id: number) {
    try {
      const resp = await fetch(`${apiBase}/agents/${id}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
    } catch (e: any) {
      console.error('Failed to refresh agent', id, e?.message || e)
    }
  }

  async function handleInteract(a: { id: number; endpoint: string }) {
    setInteract((prev) => ({ ...prev, [a.id]: { loading: true } }))
    try {
      if (!walletClient?.account || wrongNetwork) {
        throw new Error('Connect your wallet and select Base Sepolia')
      }
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient as any)
      // Resolve endpoint: use stored path or fallback to /api/agent{id}
      const ep = (a.endpoint?.trim() || `/api/agent${a.id}`)
      const url = ep.startsWith('http') ? ep : `${apiBase}${ep}`
      console.log('[x402] Interaction start', {
        url,
        method: 'GET',
        apiBase,
        address,
        chainId,
      })
      const resp = await fetchWithPayment(url, { method: 'GET' } as any)
      console.log('[x402] Interaction response', {
        status: resp.status,
        headers: {
          'x-payment-request': resp.headers.get('x-payment-request'),
          'x-payment-response': resp.headers.get('x-payment-response'),
          'x-payment': resp.headers.get('x-payment'),
        }
      })
      const data = await resp.json().catch(() => ({}))
      // Optional: decode payment response if present
      const xPayResp = resp.headers.get('x-payment-response')
      const paymentInfo = xPayResp ? decodeXPaymentResponse(xPayResp) : undefined
      if (paymentInfo) {
        console.log('[x402] Decoded payment', {
          txHash: (paymentInfo as any)?.txHash,
          chainId: (paymentInfo as any)?.chainId,
          amount: (paymentInfo as any)?.amount,
        })
      }
      setInteract((prev) => ({ ...prev, [a.id]: { loading: false, response: data, payment: paymentInfo } }))
      // After backend confirms the tx, refresh agent data in the list
      await refreshAgent(a.id)
    } catch (e: any) {
      console.error('[x402] Interaction error', { id: a.id, message: e?.message || String(e) })
      setInteract((prev) => ({ ...prev, [a.id]: { loading: false, error: e?.message || 'Error' } }))
    }
  }

  

  return (
    <div className="space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Network</div>
          <div className="mt-1 text-sm">{wrongNetwork ? 'Wrong (Base Sepolia required)' : 'Base Sepolia'}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Wallet</div>
          <div className="mt-1 text-sm truncate">{address || '—'}</div>
        </div>
        
      </div>

      

      {/* Agents list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Agents</h3>
          <div className="text-xs text-slate-400">{loadingAgents ? 'Loading…' : agentsError ? agentsError : `${agents.length} found`}</div>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="text-left rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              {(() => {
                const src = a.imageDataURI ? a.imageDataURI : (a.image ? makeImageSrc(apiBase, a.image) : undefined)
                return src ? (
                  <img src={src} alt={a.name || `Agent ${a.id}`} className="h-16 w-16 rounded-lg ring-1 ring-slate-700/50 mb-2 object-cover" />
                ) : null
              })()}
              <div className="text-xs text-slate-400">ID</div>
              <div className="text-sm">{a.id}</div>
              <div className="mt-2 text-xs text-slate-400">Endpoint</div>
              <div className="text-sm break-all">{a.endpoint}</div>
              <div className="mt-3">
                <button
                  className="px-3 py-1 text-sm rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700"
                  onClick={() => handleInteract(a)}
                  disabled={!!interact[a.id]?.loading}
                >
                  {interact[a.id]?.loading ? 'Interacting…' : 'Interact'}
                </button>
              </div>
              {interact[a.id]?.error && (
                <div className="mt-2 text-xs text-red-400">{interact[a.id]?.error}</div>
              )}
              {interact[a.id]?.response && (
                <>
                  <div className="mt-2 text-xs text-slate-400">Response</div>
                  <pre className="mt-1 text-xs text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify(interact[a.id]?.response, null, 2)}</pre>
                </>
              )}
              {interact[a.id]?.payment && (
                <>
                  <div className="mt-2 text-xs text-slate-400">Payment</div>
                  <pre className="mt-1 text-xs text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify({ txHash: interact[a.id]?.payment?.txHash, chainId: interact[a.id]?.payment?.chainId, amount: interact[a.id]?.payment?.amount }, null, 2)}</pre>
                </>
              )}
              <div className="mt-2 text-xs text-slate-400">MetadataURI</div>
              <div className="text-sm break-all">{a.metadataURI}</div>
              {a.name && (
                <>
                  <div className="mt-2 text-xs text-slate-400">Name</div>
                  <div className="text-sm break-all">{a.name}</div>
                </>
              )}
              {a.description && (
                <>
                  <div className="mt-2 text-xs text-slate-400">Description</div>
                  <div className="text-sm break-all">{a.description}</div>
                </>
              )}
              {Array.isArray(a.attributes) && a.attributes.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-slate-400">Attributes</div>
                  <ul className="mt-1 space-y-1">
                    {a.attributes.map((attr: any, idx: number) => (
                      <li key={idx} className="text-xs text-slate-300 break-all">
                        {attr?.trait_type ? `${attr.trait_type}: ` : ''}{String(attr?.value ?? '')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 text-xs text-slate-400">Reputation</div>
              <div className="text-sm">{a.reputation}</div>

            </div>
          ))}
          {!loadingAgents && !agentsError && agents.length === 0 && (
            <div className="text-sm text-slate-400">No agents registered.</div>
          )}
        </div>
      </div>

      {/* List only; details section removed */}
    </div>
  )
}