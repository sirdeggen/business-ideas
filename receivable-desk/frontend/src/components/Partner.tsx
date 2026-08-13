import { useEffect, useState } from 'react'
import { ADVANCE_PERCENT, advanceSats } from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { advanceReceivableOnChain, listHeldReceivables } from '../lib/actions'
import { errorMessage, formatSats } from '../lib/config'
import { lookupReceivables, recordAdvanceIntent, type OverlayReceivable } from '../lib/overlay'
import { InvoiceCard } from './InvoiceCard'

export function Partner() {
  const { wallet } = useWallet()
  const { url } = useOverlay()
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setRows(await lookupReceivables(url, { approvedUnpaid: true }))
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [url])

  const advance = async (row: OverlayReceivable): Promise<void> => {
    setBusy(row.invoiceId)
    setError(null)
    setStatus(null)
    try {
      if (wallet) {
        const held = (await listHeldReceivables(wallet)).find(
          (item) => item.item.invoiceId === row.invoiceId && item.item.status === 'approved'
        )
        if (held) {
          const spent = await advanceReceivableOnChain(wallet, url, held)
          setStatus(`On-chain advance-intent for ${row.invoiceId} in ${spent.txid}. No credit moved.`)
          await refresh()
          return
        }
      }
      const recorded = await recordAdvanceIntent(url, row.invoiceId)
      setStatus(
        `${recorded.notice} Stub ${ADVANCE_PERCENT}% of ${row.invoiceId} = ${formatSats(recorded.stubAdvanceSats)}.`
      )
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const book = rows.filter((row) => row.status === 'approved')

  return (
    <section className="panel">
      <h2>Credit partner</h2>
      <p>
        Approved, unpaid invoices only. <strong>Advance {ADVANCE_PERCENT}%</strong> is a stub:
        it records intent against the receipt. This desk does not originate HELOCs,
        lend, become a bank, or custody funds.
      </p>
      <button className="btn" onClick={() => void refresh()}>Refresh book</button>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
      {book.length === 0 && <p className="hint">No approved unpaid invoices.</p>}
      {book.map((row) => (
        <InvoiceCard key={`${row.txid}.${row.outputIndex}`} item={row}>
          {row.advanceBps === 0 ? (
            <button
              className="btn primary"
              disabled={busy !== null}
              onClick={() => void advance(row)}
            >
              {busy === row.invoiceId
                ? 'Recording…'
                : `Advance ${ADVANCE_PERCENT}% (${formatSats(advanceSats(row.amountSats))}) — stub`}
            </button>
          ) : (
            <p className="hint">Intent already recorded. Still not a loan.</p>
          )}
        </InvoiceCard>
      ))}
    </section>
  )
}
