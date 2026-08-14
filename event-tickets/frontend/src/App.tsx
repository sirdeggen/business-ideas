import { useState } from 'react'
import { DEMO_EVENT } from '../../protocol/ticket'
import { Attendee } from './components/Attendee'
import { Door } from './components/Door'
import { Organizer } from './components/Organizer'
import { BasketProvider } from './context/BasketContext'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { overlayCheckFailed, overlayHint, shortKey, walletHint } from './lib/config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './lib/overlay'

type Role = 'organizer' | 'attendee' | 'door'

function Shell() {
  const { identityKey, connecting, error, connect } = useWallet()
  const { url, setUrl, online, probeError } = useOverlay()
  const [role, setRole] = useState<Role>('organizer')
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
          <p className="eyebrow">BRC-100 · BSV UTXOs</p>
          <h1>{DEMO_EVENT.name}</h1>
          <p className="lede">
            One event, one ticket type, on BSV. Mint into a basket, show a QR,
            transfer by spend, redeem at the door. Pages persists on the public
            overlay (overlay-us-1 / tm_anytx). Local Docker tm_tickets is optional.
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
              {!error.includes('Access other apps') && <p className="hint">{walletHint()}</p>}
              <button className="btn" onClick={() => void connect()}>Retry wallet</button>
            </>
          )}
          {!connecting && !identityKey && !error && (
            <button className="btn primary" onClick={() => void connect()}>Connect BSV wallet</button>
          )}
        </div>
      </header>

      <p className="banner">
        {online === false
          ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
          : `Overlay ${online ? 'online' : 'checking'} · ${url} · ${overlayTopic(url)} / ${overlayLookupService(url)}`}
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
        <p>
          {usesPublicAnytx(url)
            ? 'Default is the public overlay (overlay-us-1). Broadcasts go to tm_anytx; lookups query ls_anytx and keep Demo Night tickets only.'
            : 'Using local Docker custom topics (tm_tickets / ls_tickets).'}
          {' '}Point this at http://localhost:8080 to use the optional local indexer.
          {' '}{overlayHint(url)}
        </p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        Needs BSV Desktop or BSV Browser. {walletHint()} The app calls
        createAction, getPublicKey, listOutputs, signAction, and internalizeAction.
        Keys stay in the wallet.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <OverlayProvider>
        <BasketProvider>
          <Shell />
        </BasketProvider>
      </OverlayProvider>
    </WalletProvider>
  )
}
