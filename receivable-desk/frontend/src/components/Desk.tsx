import { useEffect, useState } from 'react'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import {
  approveReceivable,
  listHeldReceivables,
  settleReceivable,
  type HeldReceivable
} from '../lib/actions'
import { errorMessage } from '../lib/config'
import { lookupReceivables } from '../lib/overlay'
import { InvoiceCard } from './InvoiceCard'

export function Desk() {
  const { wallet } = useWallet()
  const { url } = useOverlay()
  const [held, setHeld] = useState<HeldReceivable[]>([])
  const [open, setOpen] = useState<Awaited<ReturnType<typeof lookupReceivables>>>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    if (wallet) setHeld(await listHeldReceivables(wallet))
    setOpen(await lookupReceivables(url, { status: 'unpaid' }))
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [wallet, url])

  const run = async (outpoint: string, action: 'approve' | 'settle'): Promise<void> => {
    if (!wallet) return
    setBusy(outpoint + action)
    setError(null)
    setStatus(null)
    try {
      const item = held.find((row) => row.outpoint === outpoint)
      if (!item) throw new Error('This wallet does not hold that receivable UTXO')
      if (action === 'approve') {
        const result = await approveReceivable(wallet, url, item)
        setStatus(`Approved ${item.item.invoiceId} in ${result.txid}`)
      } else {
        const result = await settleReceivable(wallet, url, item)
        setStatus(`Settled ${item.item.invoiceId} with a BRC-29 payment in ${result.txid}`)
      }
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel">
      <h2>Approve / settle</h2>
      <p>
        Approve spends an <code>open</code> UTXO into <code>approved</code>. Settle is a
        BRC-29 spend: it pays the creditor the invoice amount and writes a
        <code> paid</code> marker. Overlay lookup of unpaid then drops that invoice.
      </p>
      <button className="btn" onClick={() => void refresh()}>Refresh basket + unpaid</button>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}

      <h3 className="subhead">Held in this wallet</h3>
      {held.length === 0 && <p className="hint">No receivables in the basket yet.</p>}
      {held.map((row) => (
        <InvoiceCard key={row.outpoint} item={row.item} outpoint={row.outpoint}>
          <div className="row">
            {row.item.status === 'open' && (
              <button
                className="btn primary"
                disabled={busy !== null}
                onClick={() => void run(row.outpoint, 'approve')}
              >
                {busy === row.outpoint + 'approve' ? 'Approving…' : 'Approve'}
              </button>
            )}
            {row.item.status !== 'paid' && (
              <button
                className="btn"
                disabled={busy !== null}
                onClick={() => void run(row.outpoint, 'settle')}
              >
                {busy === row.outpoint + 'settle' ? 'Settling…' : 'Settle (BRC-29)'}
              </button>
            )}
          </div>
        </InvoiceCard>
      ))}

      <h3 className="subhead">Open / approved on overlay</h3>
      {open.length === 0 && <p className="hint">No unpaid invoices in the overlay index.</p>}
      {open.map((row) => (
        <InvoiceCard key={`${row.txid}.${row.outputIndex}`} item={row} />
      ))}
    </section>
  )
}
