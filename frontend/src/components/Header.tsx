import autonomixLogo from '../assets/logo.svg'
import { ConnectWallet } from './ConnectWallet.tsx'
import { useState } from 'react'

export function Header() {
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function addBaseSepolia() {
    setError('')
    setAdding(true)
    try {
      const ethereum = (window as any)?.ethereum
      if (!ethereum?.request) throw new Error('Ethereum provider not available')
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x14a34', // 84532
          chainName: 'Base Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia.base.org'],
          blockExplorerUrls: ['https://sepolia.basescan.org'],
        }],
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to add network')
    } finally {
      setAdding(false)
    }
  }
  return (
    <header className="fixed top-0 left-0 right-0 h-20 px-5 md:px-8 flex items-center justify-between bg-slate-900/80 backdrop-blur border-b border-slate-800 z-50">
      <div className="flex items-center gap-3">
        <img src={autonomixLogo} alt="AutonomiX" className="h-10 w-10 rounded-xl ring-1 ring-slate-700/50 shadow" />
        <span className="text-lg md:text-xl font-semibold tracking-tight text-slate-100">AutonomiX</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={addBaseSepolia}
          disabled={adding}
        >
          {adding ? 'Adding…' : 'Add Base Sepolia'}
        </button>
        <ConnectWallet />
        {error && <div className="text-[11px] text-red-400">{error}</div>}
      </div>
    </header>
  )
}