import { useState } from 'react'
import { Attendee } from './components/Attendee'
import { Door } from './components/Door'
import { Organizer } from './components/Organizer'
import { BasketProvider } from './context/BasketContext'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { overlayCheckFailed, shortKey } from './lib/config'

type Role = 'organizer' | 'attendee' | 'door'

function Shell() {
  const { identityKey } = useWallet()
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
          <h1>Tickets</h1>
          <p className="lede">
            Tickets you can send, show on a phone, and spend at the door so they
            can’t be used twice.
          </p>
        </div>
      </header>

      <p className="banner">
        {online === false
          ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
          : online === true
            ? 'Ready.'
            : 'Checking…'}
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

      <details className="advanced">
        <summary>Overlay URL</summary>
        <p>Operators can point this at a local indexer.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
        {identityKey && (
          <div className="identity-ask">
            <p>Identity key</p>
            <code>{shortKey(identityKey, 12)}</code>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => void copyIdentity()}>
              {copied ? 'Copied' : 'Copy identity key'}
            </button>
          </div>
        )}
      </details>

      <footer>
        Needs BSV Desktop. Keys stay in the wallet.
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
