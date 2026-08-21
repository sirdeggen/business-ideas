import { useState } from 'react'
import { Desk } from './components/Desk'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { Register } from './components/Register'
import { Registry } from './components/Registry'
import { WalletProvider } from './context/WalletContext'
import { overlayCheckFailed } from './lib/config'

type Tab = 'desk' | 'owe' | 'register'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const [tab, setTab] = useState<Tab>('desk')

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">Invoices · collections</p>
          <h1>Who do we chase today?</h1>
          <p className="lede">
            Open invoices still owed. Not a bank. Wallet is not required to read
            the list.
          </p>
        </header>

        {online === false && (
          <p className="banner">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}. Wallet is not required to read the list.`}
          </p>
        )}

        <nav className="tabs">
          {([
            ['desk', 'Chase'],
            ['owe', 'You owe us'],
            ['register', 'Record invoice']
          ] as Array<[Tab, string]>).map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === 'desk' && <Desk />}
        {tab === 'owe' && <Registry />}
        {tab === 'register' && <Register />}
      </article>

      <details className="advanced">
        <summary>Overlay URL</summary>
        <p>Operators can point this at a local indexer.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </details>
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
