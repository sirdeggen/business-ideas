import { useEffect, useState } from 'react'
import type { ReceivablePayload } from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { errorMessage } from '../lib/config'
import { lookupReceivables, type OverlayReceivable } from '../lib/overlay'
import { InvoiceCard } from './InvoiceCard'

type Filter = 'all' | 'open' | 'approved' | 'paid' | 'unpaid'

export function Registry() {
  const { url, online } = useOverlay()
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<OverlayReceivable[]>([])
  const [creditor, setCreditor] = useState('')
  const [debtor, setDebtor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const query: {
        status?: ReceivablePayload['status'] | 'unpaid'
        creditor?: string
        debtor?: string
      } = {}
      if (filter !== 'all') query.status = filter
      if (creditor.trim()) query.creditor = creditor.trim()
      if (debtor.trim()) query.debtor = debtor.trim()
      setRows(await lookupReceivables(url, query))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, filter])

  return (
    <section className="panel">
      <h2>Registry explorer</h2>
      <p>
        DART-shaped lookup a licensed partner could refresh: who is owed, by whom,
        amount, due, status. Ten sample invoices seed the local overlay.
      </p>
      <div className="row">
        {(['all', 'open', 'approved', 'paid', 'unpaid'] as Filter[]).map((item) => (
          <button key={item} className={filter === item ? 'btn primary' : 'btn'} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
        <button className="btn" disabled={busy || online === false} onClick={() => void refresh()}>
          {busy ? 'Refreshing…' : 'Refresh overlay'}
        </button>
      </div>
      <div className="row">
        <div className="grow">
          <label htmlFor="creditorFilter">Creditor</label>
          <input id="creditorFilter" value={creditor} onChange={(event) => setCreditor(event.target.value)} placeholder="optional identity key" />
        </div>
        <div className="grow">
          <label htmlFor="debtorFilter">Debtor</label>
          <input id="debtorFilter" value={debtor} onChange={(event) => setDebtor(event.target.value)} placeholder="optional identity key" />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => void refresh()}>Apply filters</button>
      </div>
      {error && <p className="status err">{error}</p>}
      <p className="hint">{rows.length} invoice{rows.length === 1 ? '' : 's'} in this view.</p>
      {rows.map((row) => (
        <InvoiceCard key={`${row.txid}.${row.outputIndex}`} item={row} />
      ))}
    </section>
  )
}
