import type { Express } from 'express'
import { AGENT_ADDRESS, getContract, getProvider } from '../config.js'
import { loadMetadataJSON } from '../utils/metadata.js'
import { ensureImageDataURI } from '../utils/images.js'

export function registerAgentRoutes(app: Express): void {
  // List existing agents
  app.get('/agents', async (_req, res) => {
    try {
      const provider = getProvider()
      const agentAddress = AGENT_ADDRESS
      if (!provider || !agentAddress) {
        return res.status(500).json({ error: 'Backend misconfigured: RPC_URL or AGENT_ADDRESS missing' })
      }
      const c = getContract(agentAddress, provider)
      const nextIdBn: bigint = await (c as any).nextAgentId()
      const totalSupplyBn: bigint = await (c as any).totalSupply()
      const nextId = Number(nextIdBn)
      const items: Array<{ id: number, endpoint: string, metadataURI: string, reputation: string, name?: string, description?: string, imageDataURI?: string, attributes?: any[] }> = []
      for (let id = 1; id < nextId; id++) {
        const exists: boolean = await (c as any).exists(id)
        if (!exists) continue
        const [endpoint, metadataURI, rep] = await (c as any).getAgent(id)
        const meta = await loadMetadataJSON(metadataURI)
        const imageDataURI = await ensureImageDataURI(meta?.image)
        const item: { id: number, endpoint: string, metadataURI: string, reputation: string, name?: string, description?: string, imageDataURI?: string, attributes?: any[] } = {
          id,
          endpoint: String(endpoint ?? ''),
          metadataURI: String(metadataURI ?? ''),
          reputation: String(rep),
        }
        if (typeof meta?.name === 'string') item.name = meta.name
        if (typeof meta?.description === 'string') item.description = meta.description
        if (typeof imageDataURI === 'string') item.imageDataURI = imageDataURI
        if (Array.isArray(meta?.attributes)) {
          const attrs = (meta?.attributes as any[]).filter(
            (a: any) => String(a?.trait_type || '').toLowerCase() !== 'agent id'
          )
          if (attrs.length > 0) item.attributes = attrs
        }
        items.push(item)
      }
      return res.status(200).json({ nextId: String(nextIdBn), totalSupply: String(totalSupplyBn), count: items.length, items })
    } catch (e: any) {
      const msg = e?.message || 'Failed to list agents'
      return res.status(500).json({ error: msg })
    }
  })

  // Get an agent by id
  app.get('/agents/:id', async (req, res) => {
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
      const [endpoint, metadataURI, rep] = await (c as any).getAgent(idNum)
      const meta = await loadMetadataJSON(metadataURI)
      const imageDataURI = await ensureImageDataURI(meta?.image)
      const result: { id: number, endpoint: string, metadataURI: string, reputation: string, name?: string, description?: string, imageDataURI?: string, attributes?: any[] } = {
        id: idNum,
        endpoint: String(endpoint ?? ''),
        metadataURI: String(metadataURI ?? ''),
        reputation: String(rep),
      }
      if (typeof meta?.name === 'string') result.name = meta.name
      if (typeof meta?.description === 'string') result.description = meta.description
      if (typeof imageDataURI === 'string') result.imageDataURI = imageDataURI
      if (Array.isArray(meta?.attributes)) {
        const attrs = (meta?.attributes as any[]).filter(
          (a: any) => String(a?.trait_type || '').toLowerCase() !== 'agent id'
        )
        if (attrs.length > 0) result.attributes = attrs
      }
      return res.status(200).json(result)
    } catch (e: any) {
      const msg = e?.message || 'Failed to get agent'
      return res.status(500).json({ error: msg })
    }
  })
}