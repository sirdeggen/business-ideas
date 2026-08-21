import { useEffect, useState } from 'react'
import { sampleReceivables } from '../../../protocol/samples'
import { useOverlay } from '../context/OverlayContext'
import { errorMessage, overlayCheckFailed, overlayHint } from '../lib/config'
import { agePhrase, partyName, rowStatus, rowStatusLabel } from '../lib/display'
import { fetchUsdPerBsv, formatInvoiceAmount } from '../lib/money'
import { lookupReceivables, usesPublicAnytx, type OverlayReceivable } from '../lib/overlay'

function previewUnpaid(): OverlayReceivable[] {
  return sampleReceivables()
    .filter((item) => item.status !== 'paid')
    .map((item, outputIndex) => ({ ...item, txid: 'sample', outputIndex }))
}

export function Registry() {
  const { url, online, probeError } = useOverlay()
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)

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

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setUsdPerBsv)
      .catch(() => setUsdPerBsv(null))
  }, [])

  const overlayDown = online === false || Boolean(error)

  return (
    <section className="pane">
      <h2>You owe us</h2>
      <p>Open invoices on this desk.</p>
      <div className="toolbar">
        <button className="btn quiet" disabled={busy} onClick={() => void refresh()}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {overlayDown && (
        <p className="status err">{error || overlayCheckFailed(probeError, url)}</p>
      )}
      {preview && (
        <p className="hint">
          Sample invoices — local index is not running.
          {` ${overlayHint(url)}`}
        </p>
      )}
      <p className="hint">{rows.length} open invoice{rows.length === 1 ? '' : 's'}.</p>
      <div className="list">
        {rows.map((row) => {
          const badge = rowStatus(row.status, row.dueDate)
          return (
            <article key={`${row.txid}.${row.outputIndex}`} className="work-row registry-row">
              <div className="work-who">
                <strong>{partyName(row.debtor) || row.invoiceId}</strong>
              </div>
              <span className="work-id">{row.invoiceId}</span>
              <span className={`work-age${badge === 'overdue' ? ' overdue' : ''}`}>
                {agePhrase(row.dueDate)}
              </span>
              <span className={`status-word ${badge}`}>{rowStatusLabel(badge)}</span>
              <div className="work-amount">{formatInvoiceAmount(row.amountSats, usdPerBsv)}</div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
