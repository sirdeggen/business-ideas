import { useState } from 'react'
import { DEMO_EVENT } from '../../../protocol/ticket'
import { useBasket } from '../context/BasketContext'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { mintTickets } from '../lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayCheckFailed
} from '../lib/config'

export function Organizer() {
  const { wallet, connecting, connect } = useWallet()
  const { refresh } = useBasket()
  const { url, online, probeError } = useOverlay()
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  const mint = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatus(null)
    setShowInstall(false)
    try {
      if (online === false) {
        throw new Error(overlayCheckFailed(probeError, url))
      }
      const client = wallet ?? await connect()
      const result = await mintTickets(client, url, count)
      setStatus(`Made ${result.count} tickets.`)
      if (result.overlayError) {
        setError(`Made tickets (txid ${result.txid}). Overlay submit failed: ${result.overlayError}`)
      }
      await refresh()
    } catch (err) {
      console.error('Make tickets failed', err)
      setError(errorMessage(err))
      setShowInstall(true)
    } finally {
      setBusy(false)
    }
  }

  const overlayDown = online === false
  const mintDisabled = busy || connecting || overlayDown
  const mintTitle = overlayDown
    ? overlayCheckFailed(probeError, url)
    : 'Make tickets you can send, show on a phone, and spend at the door'

  return (
    <section className="panel">
      <h2>Make tickets</h2>
      <p>
        Makes {count} tickets for {DEMO_EVENT.name}. Approve in your wallet.
        Each one can be shown on a phone and spent at the door once.
      </p>
      <label htmlFor="count">Ticket count</label>
      <div className="row">
        <input
          id="count"
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <button
          className="btn primary"
          disabled={mintDisabled}
          title={mintTitle}
          onClick={() => void mint()}
        >
          {busy || connecting ? 'Making tickets…' : 'Make tickets'}
        </button>
      </div>
      {overlayDown && <p className="status err">{overlayCheckFailed(probeError, url)}</p>}
      {!(busy || connecting || showInstall) && (
        <p className="hint">We’ll ask you to approve this in a moment.</p>
      )}
      {(busy || connecting || showInstall) && <p className="hint">{CHROME_ALLOW_HINT}</p>}
      {showInstall && (
        <div className="install">
          <p>Unlock Desktop and try again. Or install BSV Desktop, then Retry.</p>
          <div className="row">
            <button className="btn primary" onClick={() => void mint()}>Retry</button>
            <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
              Install BSV Desktop
            </a>
          </div>
        </div>
      )}
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </section>
  )
}
