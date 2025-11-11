import { useAccount, useChainId } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function ConnectWallet() {
  const { isConnected } = useAccount()
  const chainId = useChainId()

  const onWrongNetwork = isConnected && chainId !== baseSepolia.id

  return (
    <div className="flex flex-col items-center gap-2">
      <ConnectButton
        chainStatus="none"
        showBalance={false}
        accountStatus={{ smallScreen: 'address', largeScreen: 'address' }}
      />
      {onWrongNetwork && (
        <p className="text-xs text-amber-400">Please switch to Base Sepolia to continue.</p>
      )}
    </div>
  )
}