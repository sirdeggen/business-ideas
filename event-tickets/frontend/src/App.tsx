import { useState } from 'react'
import { DEMO_EVENT } from '../../protocol/ticket'
import { Attendee } from './components/Attendee'
import { Door } from './components/Door'
import { Organizer } from './components/Organizer'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { shortKey } from './lib/config'

type Role = 'organizer' | 'attendee' | 'door'

function Shell() {
  const { identityKey, connecting, error, connect } = useWallet()
  const { url, setUrl, online } = useOverlay()
  const [role, setRole] = useState<Role>('organizer')

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">BRC-100 · tickets as UTXOs</p>
          <h1>{DEMO_EVENT.name}</h1>
          <p className="lede">
            One event, one ticket type. Mint into a basket, show a QR, transfer by spend,
            redeem at the door. No marketplace, no L2.
          </p>
        </div>
        <div className="identity">
          {connecting && <div>Connecting wallet…</div>}
          {identityKey && (
            <>
              Identity
              <code>{shortKey(identityKey, 12)}</code>
            </>
          )}
          {error && (
            <>
              <div className="status err">{error}</div>
              <button className="btn" onClick={() => void connect()}>Retry wallet</button>
            </>
          )}
          {!connecting && !identityKey && !error && (
            <button className="btn primary" onClick={() => void connect()}>Connect wallet</button>
          )}
        </div>
      </header>

      <p className="banner">
        Overlay {online ? 'online' : online === false ? 'offline — start docker compose' : 'checking'} · {url}
      </p>

      <nav className="tabs">
        {(['organizer', 'attendee', 'door'] as Role[]).map((item) => (
          <button key={item} className={role === item ? 'active' : ''} onClick={() => setRole(item)}>
            {item}
          </button>
        ))}
      </nav>

      {role === 'organizer' && <Organizer />}
      {role === 'attendee' && <Attendee />}
      {role === 'door' && <Door />}

      <section className="panel">
        <h2>Overlay URL</h2>
        <p>GitHub Pages is static. Point this at a local overlay-express node (default localhost:8080).</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        Needs BSV Desktop or BSV Browser. The app calls createAction, getPublicKey,
        listOutputs, signAction, and internalizeAction. Keys stay in the wallet.
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
