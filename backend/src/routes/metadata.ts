import type { Express } from 'express'
import { AGENT_ADDRESS, getContract, getProvider } from '../config.js'
import { loadMetadataJSON } from '../utils/metadata.js'

export function registerMetadataRoutes(app: Express): void {
  // Expose full metadata for an agent
  app.get('/agents/:id/metadata', async (req, res) => {
    try {
      const provider = getProvider()
      const agentAddress = AGENT_ADDRESS
      if (!provider || !agentAddress) {
        return res.status(500).json({ error: 'Backend misconfigured: RPC_URL or AGENT_ADDRESS missing' })
      }
      const idNum = Number(req.params.id)
      if (!Number.isFinite(idNum) || idNum <= 0) {
        return res.status(400).json({ error: 'Invalid agent id' })
      }
      const c = getContract(agentAddress, provider)
      const exists: boolean = await (c as any).exists(idNum)
      if (!exists) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      const [, metadataURI] = await (c as any).getAgent(idNum)
      const meta = await loadMetadataJSON(String(metadataURI ?? ''))
      if (!meta) return res.status(502).json({ error: 'Failed to load metadata' })
      return res.status(200).json({ metadataURI, metadata: meta })
    } catch (e: any) {
      const msg = e?.message || 'Failed to get metadata'
      return res.status(500).json({ error: msg })
    }
  })
}