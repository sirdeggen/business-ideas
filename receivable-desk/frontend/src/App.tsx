import { useState } from 'react'
import { Desk } from './components/Desk'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { Partner } from './components/Partner'
import { Register } from './components/Register'
import { Registry } from './components/Registry'
import { WalletProvider } from './context/WalletContext'
import { LOCAL_DESK_HINT, isGitHubPages } from './lib/config'

type Tab = 'desk' | 'owe' | 'register' | 'partner'

function Shell() {
  const { url, setUrl, online } = useOverlay()
  const [tab, setTab] = useState<Tab>('desk')
  const pages = isGitHubPages()

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Invoices · collections</p>
          <h1>Who do we chase today?</h1>
          <p className="lede">
            The paper that proves an invoice — same treasurer, after a few real
            invoices exist. Not a second product. Not a bank.
          </p>
        </div>
      </header>

      <p className="banner">
        {pages
          ? LOCAL_DESK_HINT
          : online
            ? `Local index reachable at ${url}.`
            : online === false
              ? `Local index is not running. ${LOCAL_DESK_HINT}`
              : 'Checking the local index…'}
        {' '}Not a bank. Not a lender.
      </p>

      <nav className="tabs">
        {([
          ['desk', 'Chase'],
          ['owe', 'You owe us'],
          ['register', 'Record invoice'],
          ['partner', 'Advance']
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'desk' && <Desk />}
      {tab === 'owe' && <Registry />}
      {tab === 'register' && <Register />}
      {tab === 'partner' && <Partner />}

      <section className="panel quiet-panel">
        <h2>Local index URL</h2>
        <p>
          GitHub Pages cannot settle. Point this at the Docker index (default
          http://localhost:8082).
        </p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        Wallet stays on your machine. This desk does not lend.
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
