import { useState } from 'react'
import { DEMO_EVENT } from '../../../protocol/ticket'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { mintTickets } from '../lib/actions'
import { errorMessage } from '../lib/config'

export function Organizer() {
  const { wallet } = useWallet()
  const { url, online } = useOverlay()
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mint = async (): Promise<void> => {
    if (!wallet) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const result = await mintTickets(wallet, url, count)
      setStatus(`Minted ${result.count} tickets in ${result.txid}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Mint Demo Night</h2>
      <p>
        Creates {count} general-admission UTXOs for {DEMO_EVENT.name} into the
        <code> eventtickets </code> basket, then submits them to <code>tm_tickets</code>
        on BSV overlay-express.
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
        <button className="btn primary" disabled={!wallet || busy} onClick={() => void mint()}>
          {busy ? 'Minting…' : 'Mint tickets'}
        </button>
      </div>
      <p className="hint">
        Overlay is {online === null ? 'checking' : online ? 'reachable' : 'offline'} at {url}.
        The wallet prompts for each createAction. Apps never hold keys.
      </p>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </section>
  )
}
