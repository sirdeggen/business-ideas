import { useEffect, useMemo, useState } from 'react'
import {
  AGING_LABELS,
  agingLabel,
  daysLate,
  type AgingLabel
} from '../../../protocol/receivable'
import { sampleReceivables } from '../../../protocol/samples'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import {
  inspectHeldReceivables,
  settleReceivable,
  type HeldReceivable
} from '../lib/actions'
import { formatBasketDiagnostic, unionChaseRows } from '../lib/basket'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  formatSats,
  overlayCheckFailed,
  overlayHint
} from '../lib/config'
import { loadChaseRows, saveChaseRows } from '../lib/persist'
import {
  formatLookupDiagnostic,
  inspectLookupReceivables,
  usesPublicAnytx,
  type OverlayReceivable
} from '../lib/overlay'
import { partyName } from './InvoiceCard'

function previewRows(): OverlayReceivable[] {
  return sampleReceivables()
    .filter((item) => item.status !== 'paid')
    .map((item, outputIndex) => ({ ...item, txid: 'sample', outputIndex }))
}

function reminderText(row: OverlayReceivable, late: number, aging: AgingLabel): string {
  const lateBit = late > 0 ? `${late} days late (${aging})` : aging
  return `Reminder: ${partyName(row.debtor)} still owes ${formatSats(row.amountSats)} on ${row.invoiceId}, due ${row.dueDate} — ${lateBit}.`
}

export function Desk() {
  const { wallet, connecting, error: walletError, connect } = useWallet()
  const { url, online, probeError } = useOverlay()
  const [held, setHeld] = useState<HeldReceivable[]>([])
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const canSettle = online === true

  const refresh = async (connectIfNeeded = false): Promise<void> => {
    const notes: string[] = []
    const remembered = loadChaseRows()
    let activeWallet = wallet
    if (!activeWallet && connectIfNeeded) {
      const result = await connect()
      activeWallet = result?.wallet ?? null
    }
    let heldItems: HeldReceivable[] = []
    try {
      const inspection = await inspectHeldReceivables(activeWallet)
      heldItems = inspection.held
      setHeld(heldItems)
      const basketNote = formatBasketDiagnostic(inspection)
      if (basketNote) notes.push(basketNote)
    } catch (err) {
      console.error('Desk basket list failed', err)
      notes.push(errorMessage(err, 'refresh'))
      setHeld([])
    }

    const showCombined = (overlayRows: OverlayReceivable[], previewMode: boolean): void => {
      const combined = unionChaseRows(overlayRows, heldItems, remembered)
      if (combined.length > 0) saveChaseRows(combined)
      setRows(combined)
      setPreview(previewMode)
      setError(notes.length > 0 ? notes.join(' ') : null)
    }

    try {
      const lookup = await inspectLookupReceivables(url, { status: 'unpaid' })
      const lookupNote = formatLookupDiagnostic(lookup, usesPublicAnytx(url))
      if (lookupNote) notes.push(lookupNote)
      showCombined(lookup.rows, false)
      return
    } catch (err) {
      console.error('Desk lookup failed', err)
      notes.push(errorMessage(err, 'refresh'))
    }

    const fromBasket = unionChaseRows([], heldItems, remembered)
    if (fromBasket.length > 0) {
      saveChaseRows(fromBasket)
      setRows(fromBasket)
      setPreview(false)
      setError(notes.length > 0 ? notes.join(' ') : null)
      return
    }

    if (usesPublicAnytx(url)) {
      setRows(remembered)
      setPreview(false)
      setError(notes.length > 0 ? notes.join(' ') : null)
      return
    }
    showCombined(previewRows(), true)
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [wallet, url])

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(AGING_LABELS.map((label) => [label, [] as OverlayReceivable[]])) as Record<
      AgingLabel,
      OverlayReceivable[]
    >
    for (const row of rows) {
      buckets[agingLabel(daysLate(row.dueDate))].push(row)
    }
    for (const label of AGING_LABELS) {
      buckets[label].sort((a, b) => daysLate(b.dueDate) - daysLate(a.dueDate))
    }
    return buckets
  }, [rows])

  const sendReminder = async (row: OverlayReceivable): Promise<void> => {
    const late = Math.max(0, daysLate(row.dueDate))
    const aging = agingLabel(daysLate(row.dueDate))
    await navigator.clipboard.writeText(reminderText(row, late, aging))
    setCopied(row.invoiceId)
    window.setTimeout(() => setCopied(null), 1500)
  }

  const markPaid = async (row: OverlayReceivable): Promise<void> => {
    if (!wallet) {
      const ok = await connect()
      if (!ok) return
      setStatus('Wallet connected. Click Mark paid again.')
      return
    }
    if (!canSettle) {
      setError(overlayCheckFailed(probeError, url))
      return
    }
    const item = held.find((entry) => entry.item.invoiceId === row.invoiceId && entry.item.status !== 'paid')
    if (!item) {
      setError('Mark paid needs the wallet that recorded this invoice.')
      return
    }
    setBusy(row.invoiceId)
    setError(null)
    setStatus(null)
    try {
      const pack = await settleReceivable(wallet, url, item)
      setStatus(`Marked ${pack.invoiceId} paid.`)
      await refresh()
    } catch (err) {
      console.error('Mark paid failed', err)
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const allEmpty = rows.length === 0

  return (
    <section className="panel">
      <h2>Who do we chase today?</h2>
      <p>
        Same treasurer, after invoices exist. This list is the desk’s own
        registry — not a second product.
      </p>
      {preview && (
        <p className="hint">
          Showing sample invoices because the local index is not running.
          {` ${overlayHint(url)}`}
        </p>
      )}
      <button className="btn" onClick={() => void refresh(true)}>Refresh list</button>
      {status && <p className="status ok">{status}</p>}
      {(error || walletError) && <p className="status err">{error || walletError}</p>}
      {(error || walletError) && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => void refresh(true)}>Retry</button>
          <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
            Install BSV Desktop
          </a>
        </div>
      )}
      {(error === CHROME_ALLOW_HINT || walletError === CHROME_ALLOW_HINT) && (
        <p className="hint">{CHROME_ALLOW_HINT}</p>
      )}

      {allEmpty && !preview && (
        <p className="hint">
          No open invoices yet — <a href="../invoices/">create one</a>
        </p>
      )}

      {AGING_LABELS.map((label) => (
        <div key={label} className={`aging-group aging-${label.replace(/\s+/g, '-')}`}>
          <h3 className="subhead">{label}</h3>
          {grouped[label].length === 0 && !allEmpty && <p className="hint">None.</p>}
          {grouped[label].map((row) => {
            const late = Math.max(0, daysLate(row.dueDate))
            const settleReady = canSettle && !!wallet && held.some(
              (entry) => entry.item.invoiceId === row.invoiceId && entry.item.status !== 'paid'
            )
            const markNeedsConnect = !wallet && canSettle
            return (
              <article key={`${row.txid}.${row.outputIndex}`} className="work-row">
                <div>
                  <strong>{partyName(row.debtor)}</strong>
                  <span className="work-id">{row.invoiceId}</span>
                </div>
                <div className="work-amount">{formatSats(row.amountSats)}</div>
                <div className="work-late">{late === 0 ? '0' : String(late)}</div>
                <div className="row work-actions">
                  <button className="btn" onClick={() => void sendReminder(row)}>
                    {copied === row.invoiceId ? 'Copied' : 'Send reminder'}
                  </button>
                  <button
                    className="btn primary"
                    disabled={(!settleReady && !markNeedsConnect) || busy !== null || connecting}
                    title={
                      markNeedsConnect
                        ? 'Connect only when you mark paid'
                        : settleReady
                          ? 'Mark this invoice paid'
                          : 'Mark paid needs the wallet that recorded this invoice'
                    }
                    onClick={() => void markPaid(row)}
                  >
                    {busy === row.invoiceId ? 'Marking…' : connecting ? 'Connecting…' : 'Mark paid'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ))}
    </section>
  )
}
