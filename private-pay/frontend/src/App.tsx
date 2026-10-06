import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AUDIT_VIEW_FEE_SATS,
  DEFAULT_AMOUNT_SATS,
  DEFAULT_GRANT_DAYS,
  DEFAULT_LABEL,
  DEFAULT_LINE,
  formatSats,
  nowIso,
  parseAmount,
  paymentFeeSats,
  type SealedAmount
} from '../../protocol/private-pay'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanGrant,
  assertCanPay,
  attestPayment,
  downloadReading,
  grantView,
  openView,
  payPrivate,
  revokeView
} from './lib/actions'
import {
  AMOUNT_SEALED,
  ATTESTING_BUTTON,
  ATTEST_BUTTON,
  ATTEST_JOB,
  BAND_LINE,
  DESK_DEFAULT,
  DISTINCT_LINE,
  EMPTY_LIST,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  GRANTING_BUTTON,
  GRANT_BUTTON,
  GRANT_FEE_LABEL,
  GRANT_JOB,
  HONESTY_LINE,
  JOB,
  KEY_SHAPE,
  OPENING_BUTTON,
  OPEN_BUTTON,
  OPEN_JOB,
  PAYEE_HINT,
  PAYING_BUTTON,
  PAYMENT_FEE_LABEL,
  PAY_BUTTON,
  PAY_JOB,
  PRODUCT,
  QUOTE_WAIT,
  REVOKING_BUTTON,
  REVOKE_BUTTON,
  REVOKE_JOB,
  SEALED_WORD,
  SETTLEMENT_LINE,
  STRANGER_LINE,
  formatWhen,
  grantFeeFace,
  viewFlag
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  lookupPayment,
  lookupPrivatePayItems,
  paymentsFromItems,
  type OverlayPayment,
  type PaymentView
} from './lib/overlay'
import {
  goHome,
  goToPayment,
  parsePaymentLink,
  paymentPublicUrl,
  readPaymentFromLocation
} from './lib/route'

type Busy = 'pay' | 'attest' | 'grant' | 'revoke' | 'open' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect, clearError } = useWallet()

  const initial = useMemo(() => readPaymentFromLocation(), [])
  const [paymentId, setPaymentId] = useState(initial.paymentId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [view, setView] = useState<PaymentView | null>(null)
  const [listed, setListed] = useState<OverlayPayment[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT_SATS))
  const [lineNote, setLineNote] = useState(DEFAULT_LINE)
  const [payeeIdentity, setPayeeIdentity] = useState('')
  const [payee, setPayee] = useState('')
  const [desk, setDesk] = useState('')
  const [auditor, setAuditor] = useState('')
  const [grantDays, setGrantDays] = useState(String(DEFAULT_GRANT_DAYS))
  const [openLink, setOpenLink] = useState('')
  const [opened, setOpened] = useState<SealedAmount | null>(null)

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('pay')
  const [lastGrantId, setLastGrantId] = useState('')
  const installRef = useRef<HTMLDivElement>(null)

  const overlayDown = online === false
  const payment = view?.payment ?? null
  const folded = view?.folded ?? null
  const showInstall = walletMissing || actionNeedsInstall
  const combinedError = actionError || walletError || lookupError

  const quote = useMemo(() => {
    const amountSats = parseAmount(amount)
    if (amountSats === null) return null
    return { amountSats, feeSats: paymentFeeSats(amountSats) }
  }, [amount])

  const refresh = async (id = paymentId, txid = hintTxid): Promise<void> => {
    setListBusy(true)
    try {
      if (id) {
        const next = await lookupPayment(url, id, txid || undefined)
        setView(next)
        setLookupError(next.payment ? null : 'This payment wasn’t found.')
        return
      }
      const items = await lookupPrivatePayItems(url)
      setListed(paymentsFromItems(items))
      setView(null)
      setLookupError(null)
    } catch {
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, paymentId, hintTxid])

  useEffect(() => {
    setOpened(null)
  }, [paymentId])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runPay = async (): Promise<void> => {
    setLastAction('pay')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    try {
      assertCanPay({
        label,
        amount,
        lineNote,
        payeeIdentity,
        payee,
        desk
      }, null, null)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('pay')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await payPrivate(session.wallet, url, session.identityKey, {
        label,
        amount,
        lineNote,
        payeeIdentity,
        payee,
        desk
      })
      setNotice(result.overlayError
        ? `Payment sent. Overlay submit failed: ${result.overlayError}`
        : 'Payment sent. The amount is sealed.')
      if (result.overlayError) setActionError(result.overlayError)
      setPaymentId(result.paymentId)
      setHintTxid(result.txid)
      goToPayment(result.paymentId, result.txid)
    } catch (err) {
      console.error(err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runAttest = async (): Promise<void> => {
    if (!payment || !folded) return
    setLastAction('attest')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    setBusy('attest')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await attestPayment(session.wallet, url, session.identityKey, payment, folded)
      setNotice(result.overlayError
        ? `Attested. Overlay submit failed: ${result.overlayError}`
        : 'Payee attested this payment.')
      if (result.overlayError) setActionError(result.overlayError)
      setHintTxid(result.txid)
      goToPayment(result.paymentId, result.txid)
      await refresh(result.paymentId, result.txid)
    } catch (err) {
      console.error(err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runGrant = async (): Promise<void> => {
    if (!payment || !folded) return
    setLastAction('grant')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    try {
      assertCanGrant(payment, folded, payment.payer, { auditor, days: grantDays })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('grant')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await grantView(session.wallet, url, session.identityKey, payment, folded, {
        auditor,
        days: grantDays
      })
      setNotice(result.overlayError
        ? `View granted. Overlay submit failed: ${result.overlayError}`
        : 'View granted. The auditor can open this payment until it expires or is revoked.')
      if (result.overlayError) setActionError(result.overlayError)
      setHintTxid(result.txid)
      goToPayment(result.paymentId, result.txid)
      await refresh(result.paymentId, result.txid)
    } catch (err) {
      console.error(err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRevoke = async (grantId: string): Promise<void> => {
    if (!payment || !folded) return
    setLastAction('revoke')
    setLastGrantId(grantId)
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    setBusy('revoke')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await revokeView(session.wallet, url, session.identityKey, payment, folded, grantId)
      setNotice(result.overlayError
        ? `View revoked. Overlay submit failed: ${result.overlayError}`
        : 'View revoked. This desk will not open it for that auditor.')
      if (result.overlayError) setActionError(result.overlayError)
      setOpened(null)
      setHintTxid(result.txid)
      goToPayment(result.paymentId, result.txid)
      await refresh(result.paymentId, result.txid)
    } catch (err) {
      console.error(err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runOpen = async (): Promise<void> => {
    if (!folded) return
    setLastAction('open')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    setBusy('open')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await openView(session.wallet, session.identityKey, folded)
      setOpened(result)
      setNotice('View opened for this wallet.')
    } catch (err) {
      console.error(err)
      setOpened(null)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runExport = (): void => {
    if (!folded) return
    const reading = downloadReading(folded)
    setNotice(`Reading exported. Amount sealed: ${reading.amountSats === null ? 'yes' : 'no'}.`)
  }

  const copyLink = async (): Promise<void> => {
    if (!payment) return
    const link = paymentPublicUrl(payment.paymentId, hintTxid || payment.txid)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setOpenLink(link)
    }
  }

  const runHome = (): void => {
    setPaymentId('')
    setHintTxid('')
    setView(null)
    setOpened(null)
    setNotice(null)
    setActionError(null)
    goHome()
  }

  const openPasted = (): void => {
    const parsed = parsePaymentLink(openLink)
    if (!parsed.paymentId) {
      setActionError('That link has no payment id.')
      return
    }
    setPaymentId(parsed.paymentId)
    setHintTxid(parsed.hintTxid ?? '')
    goToPayment(parsed.paymentId, parsed.hintTxid)
  }

  return (
    <div className="desk">
      <div className={`scene-crop ${payment ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A finance lead at a bright desk reviews a payroll run on a laptop, while a second screen shows an auditor with a scoped view granted panel."
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="book">
          <header className="book-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{PRODUCT}</h1>
            <p className="lede">{JOB}</p>
          </header>

          <BusinessCase />

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!paymentId && (
            <section className="block">
              <p className="job">{PAY_JOB}</p>
              <p className="helper">{DISTINCT_LINE}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="label">Run name</label>
                  <input
                    id="label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="amount">Amount</label>
                  <input
                    id="amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="line">Line note</label>
                  <input
                    id="line"
                    value={lineNote}
                    onChange={(event) => setLineNote(event.target.value)}
                    maxLength={160}
                  />
                </div>
                <div className="field">
                  <label htmlFor="payee-identity">Payee identity key</label>
                  <input
                    id="payee-identity"
                    value={payeeIdentity}
                    onChange={(event) => setPayeeIdentity(event.target.value)}
                    placeholder="Blank pays this wallet"
                  />
                </div>
                <div className="field">
                  <label htmlFor="payee-sign">Payee signing key</label>
                  <input
                    id="payee-sign"
                    value={payee}
                    onChange={(event) => setPayee(event.target.value)}
                    placeholder="Blank pays this wallet"
                  />
                </div>
              </div>
              <p className="helper">{PAYEE_HINT}</p>
              <p className="helper">{KEY_SHAPE}</p>
              {quote ? (
                <dl className="quote">
                  <div>
                    <dt>{PAYMENT_FEE_LABEL}</dt>
                    <dd>{formatSats(quote.feeSats)}</dd>
                  </div>
                  <div>
                    <dt>{GRANT_FEE_LABEL}</dt>
                    <dd>{formatSats(AUDIT_VIEW_FEE_SATS)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="helper">{QUOTE_WAIT}</p>
              )}
              <p className="helper">{FEE_FACE}</p>
              <p className="helper">{BAND_LINE}</p>
              <p className="helper">{grantFeeFace()}</p>
              <p className="helper">{SETTLEMENT_LINE}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runPay()}
                >
                  {busy === 'pay' ? PAYING_BUTTON : PAY_BUTTON}
                </button>
              </div>
              <div className="open-link">
                <label htmlFor="open-link">Open a payment link</label>
                <div className="row">
                  <input
                    id="open-link"
                    value={openLink}
                    onChange={(event) => setOpenLink(event.target.value)}
                    placeholder="?p=…"
                  />
                  <button type="button" className="btn" onClick={openPasted}>Open</button>
                </div>
              </div>
              <p className="holdings-label">Payments</p>
              {listBusy && listed.length === 0 ? (
                <p className="empty">Loading…</p>
              ) : listed.length === 0 ? (
                <p className="empty">{EMPTY_LIST}</p>
              ) : (
                <ul className="holdings">
                  {listed.map((row) => (
                    <li key={row.paymentId}>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => {
                          setPaymentId(row.paymentId)
                          setHintTxid(row.txid)
                          goToPayment(row.paymentId, row.txid)
                        }}
                      >
                        {row.label}
                      </button>
                      <span>{formatSats(row.feeSats)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {paymentId && !payment && !listBusy && (
            <p className="empty">{lookupError || 'This payment wasn’t found.'}</p>
          )}

          {payment && folded && (
            <section className="block">
              <h2>{payment.label}</h2>
              <dl className="meta">
                <div>
                  <dt>Amount</dt>
                  <dd>{AMOUNT_SEALED}</dd>
                </div>
                <div>
                  <dt>{PAYMENT_FEE_LABEL}</dt>
                  <dd>{formatSats(payment.feeSats)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{formatWhen(payment.paidAt)}</dd>
                </div>
                <div>
                  <dt>Counterparty key</dt>
                  <dd><code>{payment.counterpartyKeyId}</code></dd>
                </div>
                <div>
                  <dt>Attestation</dt>
                  <dd>{folded.attestation ? `Attested ${formatWhen(folded.attestation.attestedAt)}` : 'Waiting on the payee'}</dd>
                </div>
                <div>
                  <dt>View</dt>
                  <dd>{viewFlag(folded.viewGranted, folded.openViews)}</dd>
                </div>
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{BAND_LINE}</p>
              <p className="helper">{SETTLEMENT_LINE}</p>
              <p className="helper">{HONESTY_LINE}</p>
              <div className="actions">
                <button type="button" className="btn primary" onClick={runExport}>
                  {EXPORT_BUTTON}
                </button>
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="btn" onClick={runHome}>
                  New payment
                </button>
              </div>
            </section>
          )}

          {payment && folded && !folded.attestation && (
            <section className="slip">
              <p className="job">{ATTEST_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runAttest()}
                >
                  {busy === 'attest' ? ATTESTING_BUTTON : ATTEST_BUTTON}
                </button>
              </div>
            </section>
          )}

          {payment && folded && (
            <section className="slip">
              <p className="job">{GRANT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="auditor">Auditor identity key</label>
                  <input
                    id="auditor"
                    value={auditor}
                    onChange={(event) => setAuditor(event.target.value)}
                    placeholder="02 then 64 hex characters"
                  />
                </div>
                <div className="field">
                  <label htmlFor="grant-days">View length (days)</label>
                  <input
                    id="grant-days"
                    value={grantDays}
                    onChange={(event) => setGrantDays(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <p className="helper">{grantFeeFace()}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runGrant()}
                >
                  {busy === 'grant' ? GRANTING_BUTTON : GRANT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {payment && folded && folded.grants.length > 0 && (
            <section className="slip">
              <p className="job">{REVOKE_JOB}</p>
              <ul className="holdings">
                {folded.grants.map((grant) => {
                  const revoked = folded.revokes.some((row) => row.grantId === grant.grantId)
                  return (
                    <li key={grant.grantId}>
                      <span>{revoked ? 'Revoked' : viewFlag(true, grant.expiresAt > nowIso() ? 1 : 0)}</span>
                      <button
                        type="button"
                        className="btn"
                        disabled={revoked || busy !== null || connecting || overlayDown}
                        onClick={() => void runRevoke(grant.grantId)}
                      >
                        {busy === 'revoke' ? REVOKING_BUTTON : REVOKE_BUTTON}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {payment && folded && (
            <section className="slip">
              <p className="job">{OPEN_JOB}</p>
              <p className="status">{SEALED_WORD}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting}
                  onClick={() => void runOpen()}
                >
                  {busy === 'open' ? OPENING_BUTTON : OPEN_BUTTON}
                </button>
              </div>
              {opened && (
                <dl className="quote opened">
                  <div>
                    <dt>Amount</dt>
                    <dd>{formatSats(opened.amountSats)}</dd>
                  </div>
                  <div>
                    <dt>Line note</dt>
                    <dd>{opened.lineNote}</dd>
                  </div>
                </dl>
              )}
            </section>
          )}

          {notice && <p className="status ok">{notice}</p>}
          {combinedError && <p className="status err">{combinedError}</p>}
        </article>

        {showInstall && (
          <div className="install" ref={installRef}>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting}
                onClick={() => {
                  if (lastAction === 'attest') void runAttest()
                  else if (lastAction === 'grant') void runGrant()
                  else if (lastAction === 'revoke') void runRevoke(lastGrantId)
                  else if (lastAction === 'open') void runOpen()
                  else void runPay()
                }}
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
          <p>{HONESTY_LINE}</p>
          <p>{DESK_DEFAULT}</p>
          <label htmlFor="desk-key">Desk key</label>
          <input
            id="desk-key"
            value={desk}
            onChange={(event) => setDesk(event.target.value)}
            placeholder="Identity key that receives the fees"
          />
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {paymentId && (
            <p>
              Payment id <code>{paymentId}</code>
            </p>
          )}
          {(hintTxid || payment?.txid) && (
            <p>
              Transaction <code>{hintTxid || payment?.txid}</code>
            </p>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer. The topic stays the public one.</p>
        </details>
      </div>
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
