import { useEffect, useMemo, useState } from 'react'
import {
  AGING_LABELS,
  agingLabel,
  daysLate,
  type AgingLabel
} from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { settleReceivable, type HeldReceivable } from '../lib/actions'
import { loadChaseList } from '../lib/chase'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayCheckFailed
} from '../lib/config'
import { agePhrase, partyName, rowStatus, rowStatusLabel, workRowTitle } from '../lib/display'
import { fetchUsdPerBsv, formatInvoiceAmount } from '../lib/money'
import { type OverlayReceivable } from '../lib/overlay'
import { loadChaseRows, saveChaseRows } from '../lib/persist'

function reminderText(row: OverlayReceivable, late: number, aging: AgingLabel, amount: string): string {
  const lateBit = late > 0 ? `${late} days late (${aging})` : aging
  const who = partyName(row.debtor) || row.invoiceId
  const owed = amount || row.invoiceId
  return `Reminder: ${who} still owes ${owed} on ${row.invoiceId}, due ${row.dueDate} — ${lateBit}.`
}

function SkeletonRows() {
  return (
    <div className="list" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="work-row">
          <span className="skel skel-who" />
          <span className="skel skel-meta" />
          <span className="skel skel-meta" />
          <span className="skel skel-meta" />
          <span className="skel skel-amt" />
        </div>
      ))}
    </div>
  )
}

export function Desk() {
  const { wallet, connecting, error: walletError, connect } = useWallet()
  const { url, online, probeError } = useOverlay()
  const [held, setHeld] = useState<HeldReceivable[]>([])
  const [rows, setRows] = useState<OverlayReceivable[]>(() => loadChaseRows())
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const canSettle = online === true

  const amountLabel = (row: OverlayReceivable): string => formatInvoiceAmount(row.amountSats, usdPerBsv)

  const refresh = async (): Promise<void> => {
    const remembered = loadChaseRows()
    const result = await loadChaseList(url, wallet, remembered)
    if (result.rows.length > 0) saveChaseRows(result.rows)
    setHeld(result.held)
    setRows(result.rows)
    setPreview(result.preview)
    setError(result.error)
    setLoaded(true)
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(errorMessage(err))
      setLoaded(true)
    })
  }, [wallet, url])

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setUsdPerBsv)
      .catch(() => setUsdPerBsv(null))
  }, [])

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
    await navigator.clipboard.writeText(reminderText(row, late, aging, amountLabel(row)))
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

  const waiting = !loaded && rows.length === 0 && !preview
  const allEmpty = loaded && rows.length === 0 && !preview

  return (
    <section className="pane">
      {preview && (
        <p className="hint">Showing sample invoices because the local index is not running.</p>
      )}
      <div className="toolbar">
        <button className="btn quiet" onClick={() => void refresh()}>Refresh list</button>
      </div>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
      {error && (
        <button className="btn quiet" style={{ marginTop: 8 }} onClick={() => void refresh()}>Retry</button>
      )}
      {walletError && <p className="status err">{walletError}</p>}
      {walletError && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => void connect()}>Retry</button>
          <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
            Install BSV Desktop
          </a>
        </div>
      )}
      {walletError === CHROME_ALLOW_HINT && (
        <p className="hint">{CHROME_ALLOW_HINT}</p>
      )}

      {waiting && <SkeletonRows />}

      {allEmpty && (
        <div className="empty">
          <h2 className="empty-title">No Open Invoices</h2>
          <p>
            Create an invoice when someone owes the organization. It will show up
            here until it’s paid.
          </p>
          <a className="btn primary" href="../invoices/">Create Invoice</a>
        </div>
      )}

      {(preview || rows.length > 0) && AGING_LABELS.map((label) => {
        if (grouped[label].length === 0) return null
        return (
          <div key={label} className={`aging-group aging-${label.replace(/\s+/g, '-')}`}>
            <h3 className="aging-label">{label}</h3>
            <div className="list">
              {grouped[label].map((row) => {
                const settleReady = canSettle && !!wallet && held.some(
                  (entry) => entry.item.invoiceId === row.invoiceId && entry.item.status !== 'paid'
                )
                const markNeedsConnect = !wallet && canSettle
                const badge = rowStatus(row.status, row.dueDate)
                return (
                  <article key={`${row.txid}.${row.outputIndex}`} className="work-row chase-row">
                    <div className="work-who">
                      <strong>{workRowTitle(row.debtor, row.invoiceId)}</strong>
                    </div>
                    <span className="work-id">{row.invoiceId}</span>
                    <span className={`work-age${badge === 'overdue' ? ' overdue' : ''}`}>
                      {agePhrase(row.dueDate)}
                    </span>
                    <span className={`status-word ${badge}`}>{rowStatusLabel(badge)}</span>
                    <div className="work-amount">{amountLabel(row)}</div>
                    <div className="work-actions">
                      <button className="row-action" onClick={() => void sendReminder(row)}>
                        {copied === row.invoiceId ? 'Copied' : 'Send reminder'}
                      </button>
                      <button
                        className="row-action mark"
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
          </div>
        )
      })}
    </section>
  )
}
