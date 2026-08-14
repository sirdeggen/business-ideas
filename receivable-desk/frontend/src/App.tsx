import { useState } from 'react'
import { Desk } from './components/Desk'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { Partner } from './components/Partner'
import { Register } from './components/Register'
import { Registry } from './components/Registry'
import { WalletProvider } from './context/WalletContext'
import { overlayCheckFailed, overlayHint, walletHint } from './lib/config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './lib/overlay'

type Tab = 'desk' | 'owe' | 'register' | 'partner'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const [tab, setTab] = useState<Tab>('desk')

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Invoices · collections</p>
          <h1>Who do we chase today?</h1>
          <p className="lede">
            The paper that proves an invoice — same treasurer, after a few real
            invoices exist. Not a second product. Not a bank. Pages persists on
            the public overlay (overlay-us-1 / tm_anytx). Local Docker
            tm_receivables is optional.
          </p>
        </div>
      </header>

      <p className="banner">
        {online === false
          ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
          : `Overlay ${online ? 'online' : 'checking'} · ${url} · ${overlayTopic(url)} / ${overlayLookupService(url)}.`}
        {' '}Not a bank. Not a lender. Wallet is not required to read the list.
        {' '}{walletHint()}
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
        <h2>Overlay URL</h2>
        <p>
          {usesPublicAnytx(url)
            ? 'Default is the public overlay (overlay-us-1). Broadcasts go to tm_anytx; lookups query ls_anytx and keep this desk’s receivable fields only.'
            : 'Using local Docker custom topics (tm_receivables / ls_receivables).'}
          {' '}Point this at http://localhost:8082 to use the optional local indexer.
          {' '}{overlayHint(url)}
        </p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        Wallet stays on your machine. This desk does not lend. {walletHint()}
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
