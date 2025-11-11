import type { PropsWithChildren } from 'react'
import { useMemo } from 'react'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { baseSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config'

const queryClient = new QueryClient()

export function Web3Providers({ children }: PropsWithChildren) {
  const theme = useMemo(
    () =>
      darkTheme({
        overlayBlur: 'small',
        accentColor: '#06b6d4',
        accentColorForeground: 'white',
        borderRadius: 'large',
      }),
    []
  )
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="wide" initialChain={baseSepolia}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}