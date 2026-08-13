import { useEffect, useState } from 'react'
import { isIdentityKey } from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { registerReceivable } from '../lib/actions'
import { errorMessage } from '../lib/config'

export function Register() {
  const { wallet, identityKey } = useWallet()
  const { url, online } = useOverlay()
  const [invoiceId, setInvoiceId] = useState('INV-2026-')
  const [creditor, setCreditor] = useState('')
  const [debtor, setDebtor] = useState('')
  const [amountSats, setAmountSats] = useState(1000)
  const [dueDate, setDueDate] = useState('2026-09-30')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (identityKey && !creditor) setCreditor(identityKey)
  }, [identityKey, creditor])

  const submit = async (): Promise<void> => {
    if (!wallet) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      if (!isIdentityKey(creditor) || !isIdentityKey(debtor)) {
        throw new Error('Creditor and debtor must be 66-hex identity keys')
      }
      const result = await registerReceivable(wallet, url, {
        invoiceId,
        creditor,
        debtor,
        amountSats,
        dueDate,
        memo
      })
      setStatus(`Registered ${result.invoiceId} in ${result.txid}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Register a receivable</h2>
      <p>
        Creates one PushDrop UTXO in the <code>receivables</code> basket (status
        <code> open</code>) and submits it to <code>tm_receivables</code>. Duplicate
        invoice ids are rejected. This is a public registry entry — not a loan.
      </p>
      <label htmlFor="invoiceId">Invoice id</label>
      <input id="invoiceId" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} />
      <label htmlFor="creditor">Creditor identity</label>
      <input id="creditor" value={creditor} onChange={(event) => setCreditor(event.target.value)} />
      <label htmlFor="debtor">Debtor identity</label>
      <input id="debtor" value={debtor} onChange={(event) => setDebtor(event.target.value)} placeholder="02… or 03… compressed pubkey" />
      <div className="row">
        <div className="grow">
          <label htmlFor="amount">Amount (sats)</label>
          <input
            id="amount"
            type="number"
            min={1}
            value={amountSats}
            onChange={(event) => setAmountSats(Number(event.target.value))}
          />
        </div>
        <div className="grow">
          <label htmlFor="due">Due date</label>
          <input id="due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
      </div>
      <label htmlFor="memo">Memo</label>
      <input id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="What is owed" />
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={!wallet || busy || online === false} onClick={() => void submit()}>
          {busy ? 'Registering…' : 'Register'}
        </button>
      </div>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </section>
  )
}
