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
import { partyName, workRowTitle } from '../lib/display'
import { fetchUsdPerBsv, formatInvoiceAmount } from '../lib/money'
import { type OverlayReceivable } from '../lib/overlay'
import { loadChaseRows, saveChaseRows } from '../lib/persist'

function reminderText(row: OverlayReceivable, late: number, aging: AgingLabel, amount: string): string {
  const lateBit = late > 0 ? `${late} days late (${aging})` : aging
  const who = partyName(row.debtor) || row.invoiceId
  const owed = amount || row.invoiceId
  return `Reminder: ${who} still owes ${owed} on ${row.invoiceId}, due ${row.dueDate} — ${lateBit}.`
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

  const allEmpty = loaded && rows.length === 0 && !preview

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
      {error && <p className="status err">{error}</p>}
      {error && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => void refresh()}>Retry</button>
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

      {allEmpty && (
        <p className="hint">
          No open invoices yet — <a href="../invoices/">create one</a>
        </p>
      )}

      {(preview || rows.length > 0) && AGING_LABELS.map((label) => (
        <div key={label} className={`aging-group aging-${label.replace(/\s+/g, '-')}`}>
          <h3 className="subhead">{label}</h3>
          {grouped[label].length === 0 && <p className="hint">None.</p>}
          {grouped[label].map((row) => {
            const settleReady = canSettle && !!wallet && held.some(
              (entry) => entry.item.invoiceId === row.invoiceId && entry.item.status !== 'paid'
            )
            const markNeedsConnect = !wallet && canSettle
            return (
              <article key={`${row.txid}.${row.outputIndex}`} className="work-row chase-row">
                <div>
                  <strong>{workRowTitle(row.debtor, row.invoiceId)}</strong>
                  <span className="work-id">{row.invoiceId}</span>
                </div>
                <div className="work-amount">{amountLabel(row)}</div>
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
