import dotenv from 'dotenv'
import path from 'path'
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import AutonomiXAgentArtifact from './abi/AutonomiXAgent.json'

dotenv.config()

export const port = Number(process.env.PORT || 3000)
export const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

export const publicDir = path.join(__dirname, '..', 'public')
export const imagesDir = path.join(publicDir, 'images')
export const metadataDir = path.join(publicDir, 'metadata')

// Normalize ABI whether Hardhat artifact (with .abi) or a raw ABI array
export const AX_ABI = (AutonomiXAgentArtifact as any)?.abi ?? (AutonomiXAgentArtifact as any)

export function getProvider(): JsonRpcProvider | null {
  const rpc = process.env.RPC_URL
  return rpc ? new JsonRpcProvider(rpc) : null
}

export function getContract(addr: string, provider: JsonRpcProvider) {
  return new Contract(addr, AX_ABI as any, provider)
}

export const AGENT_ADDRESS = process.env.AGENT_ADDRESS || ''

export function getAdminSigner(provider: JsonRpcProvider): Wallet | null {
  const pk = process.env.ADMIN_PRIVATE_KEY || process.env.ADMIN_PK
  if (!pk) return null
  try {
    return new Wallet(pk, provider)
  } catch {
    return null
  }
}
// x402 (USDC) on Base Sepolia
export const X402_RECEIVER_ADDRESS = process.env.X402_RECEIVER_ADDRESS || ''
export const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia'
export const X402_PRICE_USD = process.env.X402_PRICE_USD || '$0.001'
export const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator'
export const X402_MAX_AGENT_IDS = Number(process.env.X402_MAX_AGENT_IDS || 100)
// Allowlist of external hosts for secure proxy

// Limits and cache
export const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 1048576) // 1MB by default
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60000) // 60s by default