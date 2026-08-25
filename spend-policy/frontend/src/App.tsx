import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DAILY_CAP_SATS,
  DEFAULT_EXPIRY_DAYS,
  decideSpend,
  isIdentityKey,
  remainingDailyCap,
  type AllowedPayee
} from '../../protocol/spendpolicy'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanWrite, spendAgainstPolicy, writePolicy } from './lib/actions'
import { paidLine } from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupPolicy, type OverlayPolicy, type OverlaySpend } from './lib/overlay'
import {
  goToPolicy,
  policyPublicUrl,
  readPolicyFromLocation
} from './lib/route'

const NO_POLICY_IN_THIS_LINK = 'No policy in this link.'
const JOB = 'A policy. A spend that policy allows.'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultExpiryLocal(): string {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + DEFAULT_EXPIRY_DAYS)
  return toDatetimeLocalValue(expiry)
}

function fromDatetimeLocalValue(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Expiry must be a date and time.')
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US')
}

function payeeLabel(payee: AllowedPayee): string {
  const name = payee.name?.trim() ?? ''
  return name || 'Payee'
}

function emptyPayee(): AllowedPayee {
  return { name: '', identityKey: '' }
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readPolicyFromLocation(), [])
  const [policyId, setPolicyId] = useState(initial.policyId ?? '')
  const [createTxid, setCreateTxid] = useState(initial.createTxid ?? '')
  const [policy, setPolicy] = useState<OverlayPolicy | null>(null)
  const [spends, setSpends] = useState<OverlaySpend[]>([])
  const [listBusy, setListBusy] = useState(false)

  const [payees, setPayees] = useState<AllowedPayee[]>([emptyPayee()])
  const [dailyCap, setDailyCap] = useState(String(DEFAULT_DAILY_CAP_SATS))
  const [expiryLocal, setExpiryLocal] = useState(defaultExpiryLocal)

  const [spendPayee, setSpendPayee] = useState('')
  const [spendAmount, setSpendAmount] = useState('')
  const [lastReceipt, setLastReceipt] = useState<OverlaySpend | null>(null)

  const [busy, setBusy] = useState<'write' | 'spend' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'write' | 'spend'>('write')

  const overlayDown = online === false
  const remaining = policy ? remainingDailyCap(policy, spends, new Date()) : 0
  const payablePayees = policy?.payees.filter((payee) => payee.identityKey && isIdentityKey(payee.identityKey)) ?? []

  const refresh = async (id = policyId, txid = createTxid): Promise<void> => {
    if (!id) {
      setPolicy(null)
      setSpends([])
      return
    }
    setListBusy(true)
    try {
      const view = await lookupPolicy(url, id, txid || undefined)
      setPolicy(view.policy)
      setSpends(view.spends)
      if (view.policy && !spendPayee) {
        const first = view.policy.payees.find((payee) => payee.identityKey)
        if (first?.identityKey) setSpendPayee(first.identityKey)
      }
    } catch (err) {
      console.error('Lookup failed', err)
      setPolicy(null)
      setSpends([])
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, policyId, createTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const updatePayee = (index: number, patch: AllowedPayee): void => {
    setPayees((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const runWrite = async (): Promise<void> => {
    setLastAction('write')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      assertCanWrite({ dailyCapSats: Number(dailyCap), expiry: expiryLocal, payees })
    } catch (err) {
      setActionError(`${errorMessage(err)} Open Advanced.`)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('write')
    try {
      const dailyCapSats = Number(dailyCap)
      const expiry = fromDatetimeLocalValue(expiryLocal)
      const result = await writePolicy(session.wallet, url, session.identityKey, {
        dailyCapSats,
        expiry,
        payees
      })
      setPolicyId(result.policyId)
      setCreateTxid(result.txid)
      goToPolicy(result.policyId, result.txid)
      setStatus(result.overlayError
        ? `Policy written. Overlay submit failed: ${result.overlayError}`
        : 'Policy written. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.policyId, result.txid)
    } catch (err) {
      console.error('Write policy failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runSpend = async (): Promise<void> => {
    setLastAction('spend')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (!policy) {
      setActionError(NO_POLICY_IN_THIS_LINK)
      return
    }
    const amountSats = Number(spendAmount)
    const chosen = payablePayees.find((payee) => payee.identityKey === spendPayee)
    const decision = decideSpend({
      policy,
      payeeIdentity: spendPayee,
      amountSats,
      now: new Date(),
      spends,
      payeeName: chosen?.name
    })
    if (!decision.ok) {
      setActionError(decision.reason)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('spend')
    try {
      const result = await spendAgainstPolicy(
        session.wallet,
        url,
        session.identityKey,
        policy,
        spends,
        {
          payeeIdentity: spendPayee,
          amountSats,
          payeeName: chosen?.name
        }
      )
      const paid = paidLine(chosen?.name)
      setStatus(result.overlayError
        ? `${paid} Overlay submit failed: ${result.overlayError}`
        : paid)
      if (result.overlayError) setActionError(result.overlayError)
      setLastReceipt({
        magic: policy.magic,
        version: policy.version,
        kind: 'spend',
        policyId: policy.policyId,
        spender: session.identityKey,
        payee: result.payee,
        amountSats: result.amountSats,
        spentAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        payeeName: chosen?.name,
        txid: result.txid,
        outputIndex: 1
      })
      await refresh()
    } catch (err) {
      console.error('Spend failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'spend') void runSpend()
    else void runWrite()
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const receipts = lastReceipt && !spends.some((row) => row.txid === lastReceipt.txid)
    ? [...spends, lastReceipt]
    : spends

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">Finance</p>
          <h1>Spend Policy</h1>
          <p className="lede">{JOB}</p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}

        <section className="block">
          <h2>Policy</h2>
          {!policyId && (
            <>
              <p className="job">Write a policy. A stranger can read it with no wallet.</p>
              <div className="fields">
                {payees.map((payee, index) => (
                  <div className="field" key={`payee-${index}`}>
                    <label htmlFor={`payee-name-${index}`}>Allowed payee (name)</label>
                    <input
                      id={`payee-name-${index}`}
                      value={payee.name ?? ''}
                      onChange={(event) => updatePayee(index, { name: event.target.value })}
                      placeholder="Vendor name"
                    />
                  </div>
                ))}
                <div className="row">
                  <button type="button" className="btn" onClick={() => setPayees((rows) => [...rows, emptyPayee()])}>
                    Add payee
                  </button>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="cap">Daily cap</label>
                    <input
                      id="cap"
                      type="number"
                      min={1}
                      className="amount"
                      value={dailyCap}
                      onChange={(event) => setDailyCap(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="expiry">Expiry</label>
                    <input
                      id="expiry"
                      type="datetime-local"
                      value={expiryLocal}
                      onChange={(event) => setExpiryLocal(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runWrite()}
                >
                  {busy === 'write' ? 'Writing…' : 'Write policy'}
                </button>
              </div>
            </>
          )}

          {policyId && !policy && !listBusy && (
            <p className="empty">{NO_POLICY_IN_THIS_LINK}</p>
          )}

          {policy && (
            <>
              <dl className="meta">
                <div>
                  <dt>Allowed payees</dt>
                  <dd>{policy.payees.map(payeeLabel).join(', ')}</dd>
                </div>
                <div>
                  <dt>Daily cap</dt>
                  <dd className="amount">{formatAmount(policy.dailyCapSats)}</dd>
                </div>
                <div>
                  <dt>Remaining today</dt>
                  <dd className="amount">{formatAmount(remaining)}</dd>
                </div>
                <div>
                  <dt>Expiry</dt>
                  <dd>{formatWhen(policy.expiry)}</dd>
                </div>
              </dl>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(policyPublicUrl(policy.policyId, policy.txid))}
                >
                  Copy link
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </>
          )}
        </section>

        {policy && (
          <section className="slip">
            <h2>Spend</h2>
            <p className="job">Pays a listed payee only if this policy allows. A blocked spend never opens the wallet.</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="spend-payee">Payee</label>
                <select
                  id="spend-payee"
                  value={spendPayee}
                  onChange={(event) => setSpendPayee(event.target.value)}
                >
                  {payablePayees.map((payee) => (
                    <option key={payee.identityKey} value={payee.identityKey}>
                      {payeeLabel(payee)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="spend-amount">Amount</label>
                <input
                  id="spend-amount"
                  type="number"
                  min={1}
                  className="amount"
                  value={spendAmount}
                  onChange={(event) => setSpendAmount(event.target.value)}
                />
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown}
                onClick={() => void runSpend()}
              >
                {busy === 'spend' ? 'Spending…' : 'Spend'}
              </button>
            </div>
          </section>
        )}

        {(policy || lastReceipt) && (
          <section className="slip">
            <h2>Receipt</h2>
            {receipts.length === 0 && (
              <p className="empty">No spend on this policy yet.</p>
            )}
            {receipts.map((row) => (
              <dl className="meta" key={`${row.txid}.${row.outputIndex}`}>
                <div>
                  <dt>Amount</dt>
                  <dd className="amount">{formatAmount(row.amountSats)}</dd>
                </div>
                <div>
                  <dt>Payee</dt>
                  <dd>{row.payeeName?.trim() || 'Payee'}</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{formatWhen(row.spentAt)}</dd>
                </div>
                <div>
                  <dt>Record</dt>
                  <dd><code>{shortKey(row.txid, 8)}</code></dd>
                </div>
              </dl>
            ))}
          </section>
        )}

        {status && <p className="status ok">{status}</p>}
        {combinedError && <p className="status err">{combinedError}</p>}
      </article>

      {showInstall && (
        <div className="install">
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null || connecting}
              onClick={retry}
            >
              Retry
            </button>
            <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
              Install BSV Desktop
            </a>
          </div>
        </div>
      )}
      {combinedError === CHROME_ALLOW_HINT && (
        <p className="helper">{CHROME_ALLOW_HINT}</p>
      )}

      <details className="advanced">
        <summary>Advanced</summary>
        {!policyId && payees.map((payee, index) => (
          <div className="field" key={`payee-key-${index}`}>
            <label htmlFor={`payee-key-${index}`}>Identity key</label>
            <input
              id={`payee-key-${index}`}
              value={payee.identityKey ?? ''}
              onChange={(event) => updatePayee(index, { identityKey: event.target.value.trim() })}
              placeholder="02… or 03…"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        ))}
        <p>Amounts are in sats.</p>
        <label htmlFor="overlay-url">Overlay URL</label>
        <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <p>Operators can point this at a local indexer.</p>
      </details>
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <OverlayProvider>
        <Shell />
      </OverlayProvider>
    </WalletProvider>
  )
}
