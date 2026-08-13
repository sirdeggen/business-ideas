import { useEffect, useState } from 'react'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import {
  acceptSettlePayment,
  approveReceivable,
  listHeldReceivables,
  parseSettlePackage,
  settleReceivable,
  type HeldReceivable,
  type SettlePackage
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
  const [packJson, setPackJson] = useState<string | null>(null)
  const [incoming, setIncoming] = useState('')

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
        const pack = await settleReceivable(wallet, url, item)
        setPackJson(JSON.stringify(pack, null, 2))
        setStatus(`Settled ${pack.invoiceId} with BRC-29 payment ${pack.txid}`)
      }
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const accept = async (): Promise<void> => {
    if (!wallet) return
    setBusy('accept')
    setError(null)
    try {
      const pack: SettlePackage = parseSettlePackage(incoming)
      await acceptSettlePayment(wallet, pack)
      setStatus(`Internalized BRC-29 payment for ${pack.invoiceId}`)
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
        BRC-29 spend: it pays the creditor the billed satoshis in the same transaction
        as a <code> paid</code> marker. Overlay admits the settle only if that payment
        output is present. Copy the JSON package so the creditor can
        <code> internalizeAction</code> the payment.
      </p>
      <button className="btn" onClick={() => void refresh()}>Refresh basket + unpaid</button>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
      {packJson && (
        <>
          <label htmlFor="pack">Settle package (invoice id + payment txid)</label>
          <textarea id="pack" rows={8} readOnly value={packJson} />
        </>
      )}

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

      <h3 className="subhead">Accept a settle payment</h3>
      <p className="hint">
        Creditor pastes the settle JSON. This calls <code>internalizeAction</code> with
        BRC-29 <code>wallet payment</code> remittance. It does not re-register the invoice.
      </p>
      <textarea
        rows={5}
        value={incoming}
        onChange={(event) => setIncoming(event.target.value)}
        placeholder='{"txid":"…","invoiceId":"INV-2026-011",…}'
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!wallet || busy !== null || !incoming.trim()} onClick={() => void accept()}>
          {busy === 'accept' ? 'Accepting…' : 'Accept BRC-29 payment'}
        </button>
      </div>
    </section>
  )
}
