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
  listHeldReceivables,
  settleReceivable,
  type HeldReceivable
} from '../lib/actions'
import { errorMessage, formatSats, overlayCheckFailed, walletHint } from '../lib/config'
import { lookupReceivables, usesPublicAnytx, type OverlayReceivable } from '../lib/overlay'
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

function heldToRow(held: HeldReceivable): OverlayReceivable {
  const [txid, index] = held.outpoint.split('.')
  return {
    ...held.item,
    txid: txid || 'wallet',
    outputIndex: Number(index ?? 0)
  }
}

function unionChaseRows(overlay: OverlayReceivable[], held: HeldReceivable[]): OverlayReceivable[] {
  const byId = new Map<string, OverlayReceivable>()
  for (const row of overlay) {
    if (row.status === 'paid') continue
    byId.set(row.invoiceId, row)
  }
  for (const item of held) {
    if (item.item.status === 'paid') continue
    if (!byId.has(item.item.invoiceId)) byId.set(item.item.invoiceId, heldToRow(item))
  }
  return [...byId.values()]
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
  const [loaded, setLoaded] = useState(false)
  const canSettle = online === true

  const refresh = async (): Promise<void> => {
    const nextHeld = wallet ? await listHeldReceivables(wallet) : []
    setHeld(nextHeld)
    let overlay: OverlayReceivable[] = []
    try {
      overlay = await lookupReceivables(url, { status: 'unpaid' })
      setError(null)
    } catch (err) {
      console.error('Desk lookup failed', err)
      setError(errorMessage(err))
    } finally {
      setLoaded(true)
    }
    const union = unionChaseRows(overlay, nextHeld)
    if (union.length > 0) {
      setRows(union)
      setPreview(false)
      return
    }
    if (usesPublicAnytx(url) || overlay.length === 0) {
      setRows([])
      setPreview(false)
      return
    }
    setRows(previewRows())
    setPreview(true)
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

  return (
    <section className="panel">
      <h2>Who do we chase today?</h2>
      <p>
        Same treasurer, after invoices exist. This list is the desk’s own
        registry — not a second product.
      </p>
      {preview && (
        <p className="hint">Showing sample invoices because the local index is not running.</p>
      )}
      <button className="btn" onClick={() => void refresh()}>Refresh list</button>
      {status && <p className="status ok">{status}</p>}
      {walletError && !walletError.includes('Access other apps') && (
        <p className="hint">{walletHint()}</p>
      )}
      {(error || walletError) && <p className="status err">{error || walletError}</p>}

      {loaded && rows.length === 0 && !preview && (
        <p className="hint">
          No open invoices yet — <a href="../invoices/">create one</a>
        </p>
      )}

      {(preview || rows.length > 0) && AGING_LABELS.map((label) => (
        <div key={label} className={`aging-group aging-${label.replace(/\s+/g, '-')}`}>
          <h3 className="subhead">{label}</h3>
          {grouped[label].length === 0 && <p className="hint">None.</p>}
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
