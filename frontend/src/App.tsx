import { useAccount } from 'wagmi'
import autonomixLogo from './assets/logo.svg'
import { ConnectWallet } from './components/ConnectWallet'
import { Header } from './components/Header.tsx'
import { AgentPanel } from './components/AgentPanel.tsx'

function App() {
  const { isConnected } = useAccount()

  return (
    <div className={`min-h-screen text-slate-100 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 ${isConnected ? 'pt-20' : ''}`}>
      {/* Header when connected */}
      {isConnected && <Header />}

      {/* Main content */}
      <main className="flex flex-col items-center justify-center gap-6 p-6 min-h-screen">
        {!isConnected && (
          <>
            <img
              src={autonomixLogo}
              alt="AutonomiX logo"
              className="h-24 w-24 md:h-28 md:w-28 rounded-2xl ring-1 ring-slate-700/50 shadow-lg"
            />
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">AutonomiX</h1>
            <p className="text-sm md:text-base text-slate-400 max-w-md text-center">
              Secure orchestration of autonomous agents on Sepolia.
            </p>
          </>
        )}

        {/* Centered connect prompt when not connected */}
        {!isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 shadow-xl">
              <p className="text-sm text-slate-300 mb-3">Connect your wallet to continue</p>
              <ConnectWallet />
            </div>
          </div>
        ) : (
          <section className="w-full max-w-4xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 shadow">
              <h2 className="text-xl font-semibold mb-2">Main panel</h2>
              <AgentPanel />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
