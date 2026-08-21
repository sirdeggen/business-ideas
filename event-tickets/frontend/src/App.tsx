import { useState } from 'react'
import { Attendee } from './components/Attendee'
import { Door } from './components/Door'
import { Organizer } from './components/Organizer'
import { BasketProvider } from './context/BasketContext'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider } from './context/WalletContext'
import { overlayCheckFailed } from './lib/config'

type Role = 'organizer' | 'attendee' | 'door'

const TABS: { id: Role, label: string }[] = [
  { id: 'organizer', label: 'Make tickets' },
  { id: 'attendee', label: 'Your tickets' },
  { id: 'door', label: 'At the door' }
]

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const [role, setRole] = useState<Role>('organizer')

  const banner = online === false
    ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
    : online === null
      ? 'Checking the door list…'
      : null

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

      {banner && <p className="banner">{banner}</p>}

      <nav className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={role === item.id ? 'active' : ''}
            onClick={() => setRole(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {role === 'organizer' && <Organizer />}
      {role === 'attendee' && <Attendee onMakeTickets={() => setRole('organizer')} />}
      {role === 'door' && <Door />}

      <details className="advanced">
        <summary>Overlay URL</summary>
        <p>Operators can point this at a local indexer.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </details>

      <footer>
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
