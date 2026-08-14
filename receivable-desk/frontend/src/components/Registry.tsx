import { useEffect, useState } from 'react'
import { sampleReceivables } from '../../../protocol/samples'
import { useOverlay } from '../context/OverlayContext'
import { errorMessage, formatSats, overlayHint } from '../lib/config'
import { lookupReceivables, usesPublicAnytx, type OverlayReceivable } from '../lib/overlay'
import { partyName } from './InvoiceCard'

function previewUnpaid(): OverlayReceivable[] {
  return sampleReceivables()
    .filter((item) => item.status !== 'paid')
    .map((item, outputIndex) => ({ ...item, txid: 'sample', outputIndex }))
}

export function Registry() {
  const { url, online } = useOverlay()
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const unpaid = await lookupReceivables(url, { status: 'unpaid' })
      setRows(unpaid)
      setPreview(false)
      return
    } catch (err) {
      console.error('Registry lookup failed', err)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
    if (usesPublicAnytx(url)) {
      setRows([])
      setPreview(false)
      return
    }
    setRows(previewUnpaid())
    setPreview(true)
  }

  useEffect(() => {
    void refresh()
  }, [url])

  const overlayDown = online === false || Boolean(error)

  return (
    <section className="panel">
      <h2>You owe us</h2>
      <p>
        Open invoices on this desk’s registry. No wallet needed to read the
        list.
      </p>
      <button className="btn" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
      {overlayDown && (
        <p className="status err">{error || overlayHint(url)}</p>
      )}
      {preview && (
        <p className="hint">
          Sample invoices — local index is not running.
          {` ${overlayHint(url)}`}
        </p>
      )}
      <p className="hint">{rows.length} open invoice{rows.length === 1 ? '' : 's'}.</p>
      {rows.map((row) => (
        <article key={`${row.txid}.${row.outputIndex}`} className="work-row">
          <div>
            <strong>{partyName(row.debtor)}</strong>
            <span className="work-id">{row.invoiceId}</span>
          </div>
          <div className="work-amount">{formatSats(row.amountSats)}</div>
          <div className="work-late">due {row.dueDate}</div>
        </article>
      ))}
    </section>
  )
}
