import { useMemo, useState } from 'react'
import { WalletProvider } from './context/WalletContext'
import { Desk } from './Desk'
import { Give } from './Give'
import { ReceiptView } from './ReceiptView'
import { parseLocation, roleHref, type AppRole } from './lib/config'

type SceneKind = 'hero' | 'sliver'

const SCENE_SRC = `${import.meta.env.BASE_URL}scenes/grants.webp`
const SCENE_ALT = 'A neighbor handing over a purpose-bound gift envelope.'

function SceneCrop({ kind }: { kind: SceneKind }) {
  const hero = kind === 'hero'
  return (
    <div className={`scene-crop ${kind}`} aria-hidden={hero ? undefined : true}>
      <img
        className="scene"
        src={SCENE_SRC}
        alt={hero ? SCENE_ALT : ''}
        width={1400}
        height={933}
        decoding="async"
        {...(hero ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
      />
    </div>
  )
}

function Chip() {
  return <span className="chip" aria-hidden="true" />
}

function Shell() {
  const initial = useMemo(() => parseLocation(), [])
  const [role, setRole] = useState<AppRole>(initial.receiptTxid ? 'desk' : initial.role)
  const [org] = useState(initial.org || '')
  const [name] = useState(initial.name || '')
  const receiptTxid = initial.receiptTxid
  const scene: SceneKind = receiptTxid ? 'sliver' : 'hero'

  const switchRole = (next: AppRole): void => {
    setRole(next)
    const url = roleHref(next, { org: org || undefined, name: name || undefined })
    window.history.replaceState({}, '', url)
  }

  const title = receiptTxid ? 'Receipt' : role === 'give' ? 'Give' : 'Desk'

  return (
    <div className={`room scene-${scene}`}>
      <SceneCrop kind={scene} />
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            {!receiptTxid && (
              <nav className="roles" aria-label="Role">
                <button type="button" className={role === 'give' ? 'active' : ''} onClick={() => switchRole('give')}>
                  Give
                </button>
                <button type="button" className={role === 'desk' ? 'active' : ''} onClick={() => switchRole('desk')}>
                  Desk
                </button>
              </nav>
            )}
            <p className="product-title">
              <Chip />
              Grant receipt
            </p>
            <h1>{title}</h1>
            {!receiptTxid && (
              <p className="lede">A gift for a purpose. A receipt bound to that purpose.</p>
            )}
          </header>

          {receiptTxid ? (
            <ReceiptView txid={receiptTxid} deskName={name} />
          ) : role === 'give' ? (
            <Give orgIdentity={org} orgName={name} />
          ) : (
            <Desk orgIdentity={org} />
          )}
        </article>

        <p className="fine-print">
          A purpose-restricted gift and a signed receipt. Not a tax letter.
          Not a shared vault.
        </p>
      </div>
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
