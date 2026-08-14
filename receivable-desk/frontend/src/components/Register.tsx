import { useState } from 'react'
import {
  DISPLAY_NAME_MAX,
  isIdentityKey,
  resolvePartyIdentity
} from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { registerReceivable } from '../lib/actions'
import { errorMessage, overlayCheckFailed, walletHint } from '../lib/config'

function nameTooLong(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > DISPLAY_NAME_MAX && !isIdentityKey(trimmed)
}

export function Register() {
  const { wallet, identityKey, connecting, error: walletError, connect } = useWallet()
  const { url, online, probeError } = useOverlay()
  const [invoiceId, setInvoiceId] = useState('INV-2026-')
  const [creditorName, setCreditorName] = useState('')
  const [debtorName, setDebtorName] = useState('')
  const [creditorHex, setCreditorHex] = useState('')
  const [debtorHex, setDebtorHex] = useState('')
  const [amountSats, setAmountSats] = useState(1000)
  const [dueDate, setDueDate] = useState('2026-09-30')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const overlayDown = online === false
  const resolvedCreditor = resolvePartyIdentity(creditorName, creditorHex, identityKey)
  const resolvedDebtor = resolvePartyIdentity(debtorName, debtorHex)
  const debtorMissing = resolvedDebtor === null
  const advancedCreditorBad = creditorHex.trim().length > 0 && !isIdentityKey(creditorHex)
  const advancedDebtorBad = debtorHex.trim().length > 0 && !isIdentityKey(debtorHex)
  const sameParty = resolvedCreditor !== null && resolvedDebtor !== null && resolvedCreditor === resolvedDebtor
  const namesTooLong = nameTooLong(creditorName) || nameTooLong(debtorName)
  const registerDisabled =
    busy || connecting || overlayDown || debtorMissing || advancedCreditorBad || advancedDebtorBad || sameParty || namesTooLong
  const registerTitle = overlayDown
    ? overlayCheckFailed(probeError, url)
    : debtorMissing
      ? 'Who owes us is required before Record is enabled'
      : advancedCreditorBad || advancedDebtorBad
        ? 'Account id in Advanced must be a 66-character key, or leave it blank'
        : sameParty
          ? 'Who is owed and who owes us must be different'
          : namesTooLong
            ? 'Names must be 80 characters or fewer'
            : connecting
              ? 'Connecting wallet…'
              : 'Record this invoice on the overlay'

  const submit = async (): Promise<void> => {
    if (overlayDown) {
      setError(overlayCheckFailed(probeError, url))
      return
    }
    if (debtorMissing) {
      setError('Who owes us is required.')
      return
    }
    if (advancedCreditorBad || advancedDebtorBad) {
      setError('Account id in Advanced must be a 66-character key, or leave it blank.')
      return
    }
    if (sameParty) {
      setError('Who is owed and who owes us must be different.')
      return
    }
    if (namesTooLong) {
      setError('Names must be 80 characters or fewer.')
      return
    }

    let activeWallet = wallet
    let activeIdentity = identityKey
    if (!activeWallet) {
      const result = await connect()
      if (!result) return
      activeWallet = result.wallet
      activeIdentity = result.identityKey
    }

    const creditor = resolvePartyIdentity(creditorName, creditorHex, activeIdentity)
    const debtor = resolvePartyIdentity(debtorName, debtorHex)
    if (!creditor || !debtor) {
      setError(debtor ? 'Who is owed needs a name or organisation.' : 'Who owes us is required.')
      return
    }
    if (creditor === debtor) {
      setError('Who is owed and who owes us must be different.')
      return
    }

    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const result = await registerReceivable(activeWallet, url, {
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
      <input
        id="creditor"
        value={creditorName}
        onChange={(event) => setCreditorName(event.target.value)}
        placeholder="Riverside Hall"
        autoComplete="organization"
      />
      <label htmlFor="debtor">Who owes us</label>
      <input
        id="debtor"
        value={debtorName}
        onChange={(event) => setDebtorName(event.target.value)}
        placeholder="Alex"
        autoComplete="name"
      />
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
      <details className="advanced">
        <summary>Advanced</summary>
        <p className="hint">
          Optional account id. Leave blank to record the name. Only needed to pay on-chain.
        </p>
        <label htmlFor="creditorHex">Account id for who is owed</label>
        <input
          id="creditorHex"
          value={creditorHex}
          onChange={(event) => setCreditorHex(event.target.value)}
          placeholder="Leave blank unless you already have one"
          spellCheck={false}
          autoComplete="off"
        />
        <label htmlFor="debtorHex">Account id for who owes us</label>
        <input
          id="debtorHex"
          value={debtorHex}
          onChange={(event) => setDebtorHex(event.target.value)}
          placeholder="Leave blank unless you already have one"
          spellCheck={false}
          autoComplete="off"
        />
      </details>
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
      {overlayDown && <p className="status err">{overlayCheckFailed(probeError, url)}</p>}
      {walletError && !walletError.includes('Access other apps') && (
        <p className="hint">{walletHint()}</p>
      )}
      {status && <p className="status ok">{status}</p>}
      {(error || walletError) && <p className="status err">{error || walletError}</p>}
    </section>
  )
}
