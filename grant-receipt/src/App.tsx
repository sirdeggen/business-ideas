import { useMemo, useState } from 'react'
import { WalletProvider } from './context/WalletContext'
import { Desk } from './Desk'
import { Give } from './Give'
import { ReceiptView } from './ReceiptView'
import { parseLocation, roleHref, type AppRole } from './lib/config'

function Shell() {
  const initial = useMemo(() => parseLocation(), [])
  const [role, setRole] = useState<AppRole>(initial.receiptTxid ? 'desk' : initial.role)
  const [org] = useState(initial.org || '')
  const [name] = useState(initial.name || '')
  const receiptTxid = initial.receiptTxid

  const switchRole = (next: AppRole): void => {
    setRole(next)
    const url = roleHref(next, { org: org || undefined, name: name || undefined })
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Grant Receipt Desk</p>
          <h1>{receiptTxid ? 'Receipt' : role === 'give' ? 'Give' : 'Desk'}</h1>
          <p className="lede">A gift for a purpose. A receipt bound to that purpose.</p>
        </div>
      </header>

      {!receiptTxid && (
        <nav className="tabs" aria-label="Role">
          <button className={`tab ${role === 'give' ? 'active' : ''}`} onClick={() => switchRole('give')}>
            Give
          </button>
          <button className={`tab ${role === 'desk' ? 'active' : ''}`} onClick={() => switchRole('desk')}>
            Desk
          </button>
        </nav>
      )}

      {receiptTxid ? (
        <ReceiptView txid={receiptTxid} />
      ) : role === 'give' ? (
        <Give orgIdentity={org} orgName={name} />
      ) : (
        <Desk orgIdentity={org} />
      )}

      <p className="fine-print">
        A purpose-restricted gift and a signed receipt. Not a tax letter.
        Not a shared vault.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  )
}
