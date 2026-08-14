import { useEffect, useState } from 'react'
import { isIdentityKey } from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { registerReceivable } from '../lib/actions'
import { errorMessage, overlayHint, walletHint } from '../lib/config'

export function Register() {
  const { wallet, identityKey, connecting, error: walletError, connect } = useWallet()
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

  const overlayDown = online === false
  const debtorMissing = !debtor.trim()
  const registerDisabled = busy || connecting || overlayDown || debtorMissing
  const registerTitle = overlayDown
    ? overlayHint(url)
    : debtorMissing
      ? 'Who owes us is required before Record is enabled'
      : connecting
        ? 'Connecting wallet…'
        : 'Record this invoice on the overlay'

  const submit = async (): Promise<void> => {
    if (overlayDown) {
      setError(overlayHint(url))
      return
    }
    if (debtorMissing) {
      setError('Who owes us is required.')
      return
    }
    if (!wallet) {
      const ok = await connect()
      if (!ok) return
      setStatus('Wallet connected. Click Record again.')
      return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      if (!isIdentityKey(creditor) || !isIdentityKey(debtor)) {
        throw new Error('Who is owed and who owes must be 66-hex account ids')
      }
      const result = await registerReceivable(wallet, url, {
        invoiceId,
        creditor,
        debtor,
        amountSats,
        dueDate,
        memo
      })
      setStatus(`Recorded ${result.invoiceId}.`)
    } catch (err) {
      console.error('Register failed', err)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Record an invoice</h2>
      <p>
        Same treasurer — the paper that proves an invoice you already issued.
        Not a loan. Wallet is only needed to record, not to read the list.
      </p>
      <label htmlFor="invoiceId">Invoice id</label>
      <input id="invoiceId" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} />
      <label htmlFor="creditor">Who is owed</label>
      <input id="creditor" value={creditor} onChange={(event) => setCreditor(event.target.value)} />
      <label htmlFor="debtor">Who owes us</label>
      <input id="debtor" value={debtor} onChange={(event) => setDebtor(event.target.value)} placeholder="Account id" />
      {debtorMissing && (
        <p className="hint">Record stays disabled until who owes us is filled in.</p>
      )}
      <div className="row">
        <div className="grow">
          <label htmlFor="amount">Amount</label>
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
        <button
          className="btn primary"
          disabled={registerDisabled}
          title={registerTitle}
          onClick={() => void submit()}
        >
          {busy ? 'Recording…' : connecting ? 'Connecting…' : 'Record'}
        </button>
      </div>
      {overlayDown && <p className="status err">{overlayHint(url)}</p>}
      {walletError && !walletError.includes('Access other apps') && (
        <p className="hint">{walletHint()}</p>
      )}
      {status && <p className="status ok">{status}</p>}
      {(error || walletError) && <p className="status err">{error || walletError}</p>}
    </section>
  )
}
