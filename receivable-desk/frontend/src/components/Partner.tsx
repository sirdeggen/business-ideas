import { useEffect, useState } from 'react'
import { sampleReceivables } from '../../../protocol/samples'
import { useOverlay } from '../context/OverlayContext'
import { LOCAL_OVERLAY_HINT, errorMessage, formatSats } from '../lib/config'
import { lookupReceivables, type OverlayReceivable } from '../lib/overlay'
import { partyName } from './InvoiceCard'

const ADVANCE_LABEL = 'Advance against this invoice — not available.'

function previewApproved(): OverlayReceivable[] {
  return sampleReceivables()
    .filter((item) => item.status === 'approved')
    .map((item, outputIndex) => ({ ...item, txid: 'sample', outputIndex }))
}

export function Partner() {
  const { url } = useOverlay()
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const book = await lookupReceivables(url, { approvedUnpaid: true })
      if (book.length > 0) {
        setRows(book.filter((row) => row.status === 'approved'))
        setError(null)
        return
      }
    } catch (err) {
      console.error('Advance list lookup failed', err)
      setError(errorMessage(err))
    }
    setRows(previewApproved())
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [url])

  return (
    <section className="panel">
      <h2>Advance</h2>
      <p>
        We are not a bank or a lender. Advance is not available.
      </p>
      <button className="btn" onClick={() => void refresh()}>Refresh</button>
      {error && <p className="status err">{error}</p>}
      {error && !error.includes('local Docker') && <p className="hint">{LOCAL_OVERLAY_HINT}</p>}
      {rows.length === 0 && (
        <div className="work-row">
          <div>No invoices in this view.</div>
          <button className="btn" disabled>{ADVANCE_LABEL}</button>
        </div>
      )}
      {rows.map((row) => (
        <article key={`${row.txid}.${row.outputIndex}`} className="work-row">
          <div>
            <strong>{partyName(row.debtor)}</strong>
            <span className="work-id">{row.invoiceId}</span>
          </div>
          <div className="work-amount">{formatSats(row.amountSats)}</div>
          <button className="btn" disabled title={ADVANCE_LABEL}>
            {ADVANCE_LABEL}
          </button>
        </article>
      ))}
    </section>
  )
}
