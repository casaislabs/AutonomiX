import type { Express, Request, Response } from 'express'
import { AGENT_ADDRESS, getContract, getProvider, getAdminSigner } from '../../config.js'

export function registerAgent3Endpoint(app: Express): void {
  app.get('/api/agent3', async (_req: Request, res: Response) => {
    try {
      const provider = getProvider()
      const agentAddress = AGENT_ADDRESS
      if (!provider || !agentAddress) {
        return res.status(500).json({ error: 'Backend misconfigured: RPC_URL or AGENT_ADDRESS missing' })
      }
      const signer = getAdminSigner(provider)
      if (!signer) {
        return res.status(500).json({ error: 'Backend misconfigured: ADMIN_PRIVATE_KEY missing or invalid' })
      }
      const contract = getContract(agentAddress, provider).connect(signer) as any
      const id = 3
      const exists: boolean = await (getContract(agentAddress, provider) as any).exists(id)
      if (!exists) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      const tx = await contract.updateReputation(id, 1)
      const receipt = await tx.wait()
      const [, , rep] = await (getContract(agentAddress, provider) as any).getAgent(id)
      return res.status(200).json({ message: "hello, i'm Athena", txHash: String(receipt?.hash || tx?.hash || ''), reputation: String(rep) })
    } catch (e: any) {
      const msg = e?.message || 'Failed to update reputation'
      return res.status(500).json({ error: msg })
    }
  })
}