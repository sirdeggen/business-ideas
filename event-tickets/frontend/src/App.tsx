import { useState } from 'react'
import { Attendee } from './components/Attendee'
import { Door } from './components/Door'
import { Organizer } from './components/Organizer'
import { BasketProvider } from './context/BasketContext'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider } from './context/WalletContext'
import { overlayCheckFailed } from './lib/config'

type Role = 'organizer' | 'attendee' | 'door'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const [role, setRole] = useState<Role>('organizer')

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
