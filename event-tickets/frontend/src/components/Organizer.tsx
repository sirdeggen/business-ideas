import { useState } from 'react'
import { DEMO_EVENT } from '../../../protocol/ticket'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { mintTickets } from '../lib/actions'
import { LOCAL_OVERLAY_HINT, errorMessage, walletHint } from '../lib/config'

export function Organizer() {
  const { wallet } = useWallet()
  const { url, online } = useOverlay()
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mint = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      if (!wallet) {
        throw new Error(walletHint())
      }
      if (online === false) {
        throw new Error(LOCAL_OVERLAY_HINT)
      }
      const result = await mintTickets(wallet, url, count)
      setStatus(`Minted ${result.count} tickets in ${result.txid}`)
    } catch (err) {
      console.error('Mint failed', err)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const overlayDown = online === false
  const mintDisabled = !wallet || busy || overlayDown
  const mintTitle = !wallet
    ? walletHint()
    : overlayDown
      ? LOCAL_OVERLAY_HINT
      : 'Mint tickets into the wallet basket, then submit to the local overlay'

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
        <button
          className="btn primary"
          disabled={mintDisabled}
          title={mintTitle}
          onClick={() => void mint()}
        >
          {busy ? 'Minting…' : 'Mint tickets'}
        </button>
      </div>
      {overlayDown && <p className="status err">{LOCAL_OVERLAY_HINT}</p>}
      {!wallet && (
        <p className="hint">Connect BSV Desktop before mint. {walletHint()}</p>
      )}
      <p className="hint">
        Overlay is {online === null ? 'checking' : online ? 'reachable' : 'offline'} at {url}.
        The wallet prompts for each createAction. Apps never hold keys.
      </p>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </section>
  )
}
