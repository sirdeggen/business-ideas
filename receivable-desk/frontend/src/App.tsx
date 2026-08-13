import { useState } from 'react'
import { Desk } from './components/Desk'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { Partner } from './components/Partner'
import { Register } from './components/Register'
import { Registry } from './components/Registry'
import { WalletProvider, useWallet } from './context/WalletContext'
import { shortKey } from './lib/config'

type Tab = 'register' | 'desk' | 'registry' | 'partner'

function Shell() {
  const { identityKey, connecting, error, connect } = useWallet()
  const { url, setUrl, online } = useOverlay()
  const [tab, setTab] = useState<Tab>('registry')
  const [copied, setCopied] = useState(false)

  const copyIdentity = async (): Promise<void> => {
    if (!identityKey) return
    await navigator.clipboard.writeText(identityKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">BRC-100 · BSV registry</p>
          <h1>Receivable desk</h1>
          <p className="lede">
            Who is owed, by whom, amount, due, status. A cheap public invoice
            registry — Figure DART analog, invoices not houses. Not a lender.
          </p>
        </div>
        <div className="identity">
          {connecting && <div>Connecting BSV wallet…</div>}
          {identityKey && (
            <>
              Identity key
              <code>{shortKey(identityKey, 12)}</code>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => void copyIdentity()}>
                {copied ? 'Copied' : 'Copy identity key'}
              </button>
            </>
          )}
          {error && (
            <>
              <div className="status err">{error}</div>
              <button className="btn" onClick={() => void connect()}>Retry wallet</button>
            </>
          )}
          {!connecting && !identityKey && !error && (
            <button className="btn primary" onClick={() => void connect()}>Connect BSV wallet</button>
          )}
        </div>
      </header>

      <p className="banner">
        Overlay {online ? 'online' : online === false ? 'offline — start docker compose' : 'checking'} · {url}
        {' · '}This app never holds keys, never lends, never custodies invoice funds.
      </p>

      <nav className="tabs">
        {([
          ['register', 'Register'],
          ['desk', 'Approve / settle'],
          ['registry', 'Registry'],
          ['partner', 'Credit partner']
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'register' && <Register />}
      {tab === 'desk' && <Desk />}
      {tab === 'registry' && <Registry />}
      {tab === 'partner' && <Partner />}

      <section className="panel">
        <h2>Overlay URL</h2>
        <p>GitHub Pages is static. Point this at a local overlay-express node (default localhost:8081).</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        Needs BSV Desktop or BSV Browser. The app calls createAction, getPublicKey,
        listOutputs, and signAction. Keys stay in the wallet. BSV only.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <OverlayProvider>
        <Shell />
      </OverlayProvider>
    </WalletProvider>
  )
}
