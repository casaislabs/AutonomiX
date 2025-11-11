import { http, createConfig } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injected } from 'wagmi/connectors'

const appName = 'AutonomiX'
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const baseSepoliaRpc = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL

const transports = {
  [baseSepolia.id]: http(baseSepoliaRpc || undefined),
}

export const config = projectId
  ? getDefaultConfig({
      appName,
      projectId,
      chains: [baseSepolia],
      transports,
      ssr: false,
    })
  : createConfig({
      chains: [baseSepolia],
      transports,
      connectors: [injected({ shimDisconnect: true })],
      ssr: false,
    })