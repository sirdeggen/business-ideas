import { useEffect, useState } from 'react'
import {
  DISPLAY_NAME_MAX,
  isIdentityKey,
  resolvePartyIdentity
} from '../../../protocol/receivable'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { registerReceivable } from '../lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayCheckFailed
} from '../lib/config'
import {
  fetchUsdPerBsv,
  formatUsdInput,
  parseUsdAmount,
  tryParseUsdAmount,
  usdToSats
} from '../lib/money'

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
  const [amount, setAmount] = useState('50.00')
  const [dueDate, setDueDate] = useState('2026-09-30')
  const [memo, setMemo] = useState('')
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastTxid, setLastTxid] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchUsdPerBsv()
      .then((rate) => {
        if (cancelled) return
        setUsdPerBsv(rate)
        setRateError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setUsdPerBsv(null)
        setRateError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  const overlayDown = online === false
  const resolvedCreditor = resolvePartyIdentity(creditorName, creditorHex, identityKey)
  const resolvedDebtor = resolvePartyIdentity(debtorName, debtorHex)
  const debtorMissing = resolvedDebtor === null
  const advancedCreditorBad = creditorHex.trim().length > 0 && !isIdentityKey(creditorHex)
  const advancedDebtorBad = debtorHex.trim().length > 0 && !isIdentityKey(debtorHex)
  const sameParty = resolvedCreditor !== null && resolvedDebtor !== null && resolvedCreditor === resolvedDebtor
  const namesTooLong = nameTooLong(creditorName) || nameTooLong(debtorName)
  const parsedAmount = tryParseUsdAmount(amount)
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

  const commitAmount = (): void => {
    if (parsedAmount != null) setAmount(formatUsdInput(parsedAmount))
  }

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

    let usd: number
    try {
      usd = parseUsdAmount(amount)
    } catch (err) {
      setError(errorMessage(err))
      return
    }

    let rate = usdPerBsv
    if (!rate) {
      try {
        rate = await fetchUsdPerBsv()
        setUsdPerBsv(rate)
        setRateError(null)
      } catch (err) {
        const message = errorMessage(err)
        setRateError(message)
        setError(`Could not fetch a dollar rate. ${message}`)
        return
      }
    }

    let amountSats: number
    try {
      amountSats = usdToSats(usd, rate)
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    setAmount(formatUsdInput(usd))

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
    setLastTxid(null)
    const silent = window.setTimeout(() => {
      setBusy(false)
      setError(CHROME_ALLOW_HINT)
    }, 8000)
    try {
      const result = await registerReceivable(activeWallet, url, {
        invoiceId,
        creditor,
        debtor,
        amountSats,
        dueDate,
        memo
      })
      window.clearTimeout(silent)
      setStatus('Recorded.')
      setLastTxid(result.txid)
      if (result.overlayError) {
        setError(`Recorded. Overlay submit failed: ${result.overlayError}`)
      } else {
        setError(null)
      }
    } catch (err) {
      window.clearTimeout(silent)
      console.error('Register failed', err)
      setError(errorMessage(err, 'record'))
    } finally {
      window.clearTimeout(silent)
      setBusy(false)
    }
  }

  return (
    <section className="pane">
      <h2>Record an invoice</h2>
      <p>
        The paper that proves an invoice you already issued. Wallet is only
        needed to record.
      </p>
      <div className="fields">
        <div className="field">
          <label htmlFor="invoiceId">Invoice id</label>
          <input id="invoiceId" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="creditor">Who is owed</label>
          <input
            id="creditor"
            value={creditorName}
            onChange={(event) => setCreditorName(event.target.value)}
            placeholder="Riverside Hall"
            autoComplete="organization"
          />
        </div>
        <div className="field">
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
        </div>
        <div className="row">
          <div className="grow field">
            <label htmlFor="amount">Amount</label>
            <div className="dollar">
              <span>$</span>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onBlur={commitAmount}
              />
            </div>
          </div>
          <div className="grow field">
            <label htmlFor="due">Due date</label>
            <input id="due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="memo">Memo</label>
          <input id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="What is owed" />
        </div>
      </div>
      {rateError && (
        <p className="status err">Couldn’t get the dollar rate. {rateError}</p>
      )}
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
        {lastTxid && (
          <p className="hint">txid <code>{lastTxid}</code></p>
        )}
      </details>
      <div className="actions">
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
      {status && <p className="status ok">{status}</p>}
      {(error || walletError) && <p className="status err">{error || walletError}</p>}
      {(error || walletError) && !overlayDown && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={busy || connecting} onClick={() => void submit()}>
            Retry
          </button>
          <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
            Install BSV Desktop
          </a>
        </div>
      )}
      {(error === CHROME_ALLOW_HINT || walletError === CHROME_ALLOW_HINT) && (
        <p className="hint">{CHROME_ALLOW_HINT}</p>
      )}
    </section>
  )
}
