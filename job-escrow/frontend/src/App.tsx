import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_AMOUNT_SATS,
  DEFAULT_LABEL,
  DEFAULT_PROVIDER_NAME,
  canChallenge,
  canRefund,
  canRelease,
  canSubmit,
  sheetTitle,
  type JobStatus
} from '../../protocol/jobescrow'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanFund,
  challengeJob,
  fundJob,
  refundJob,
  releaseJob,
  submitHash
} from './lib/actions'
import {
  CHALLENGE_BUTTON,
  CHALLENGING_BUTTON,
  EYEBROW,
  FEE_STORY,
  FUND_BUTTON,
  FUND_JOB,
  FUNDING_BUTTON,
  JOB,
  NOT_CLIENT,
  NOT_PROVIDER,
  REFUND_BUTTON,
  REFUNDING_BUTTON,
  RELEASE_BUTTON,
  RELEASE_JOB,
  RELEASING_BUTTON,
  STRANGER_LINE,
  SUBMIT_BUTTON,
  SUBMIT_JOB,
  SUBMITTING_BUTTON,
  formatAmount,
  formatWhen,
  hashFace,
  stampFor
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupJob, type OverlayFund } from './lib/overlay'
import { goToJob, jobPublicUrl, readJobFromLocation } from './lib/route'

type Busy = 'fund' | 'submit' | 'release' | 'challenge' | 'refund' | null

function stampClass(label: string): string {
  if (label === 'Released') return 'released'
  if (label === 'Refunded') return 'refunded'
  if (label === 'Challenged') return 'challenged'
  if (label === 'Hash in') return 'submitted'
  return 'locked'
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readJobFromLocation(), [])
  const [jobId, setJobId] = useState(initial.jobId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.fundTxid ?? '')
  const [fund, setFund] = useState<OverlayFund | null>(null)
  const [submit, setSubmit] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [status, setJobStatus] = useState<JobStatus | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [providerName, setProviderName] = useState(DEFAULT_PROVIDER_NAME)
  const [providerKey, setProviderKey] = useState('')
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT_SATS))
  const [deliverableHash, setDeliverableHash] = useState('')

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('fund')
  const [copied, setCopied] = useState(false)

  const overlayDown = online === false
  const title = sheetTitle(status)

  const refresh = async (id = jobId, txid = hintTxid): Promise<void> => {
    if (!id) {
      setFund(null)
      setSubmit(null)
      setSubmittedAt(null)
      setJobStatus(null)
      setLookupError(null)
      return
    }
    setListBusy(true)
    try {
      const view = await lookupJob(url, id, txid || undefined)
      setFund(view.fund)
      setSubmit(view.submit?.deliverableHash ?? null)
      setSubmittedAt(view.submit?.submittedAt ?? null)
      setJobStatus(view.status)
      setLookupError(view.fund ? null : 'This job wasn’t found.')
    } catch {
      setFund(null)
      setSubmit(null)
      setSubmittedAt(null)
      setJobStatus(null)
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, jobId, hintTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runFund = async (): Promise<void> => {
    setLastAction('fund')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    let amountSats: number
    try {
      amountSats = Number(amount.replace(/,/g, ''))
      assertCanFund({
        label,
        providerName,
        providerIdentity: providerKey,
        amountSats
      })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('fund')
    try {
      const result = await fundJob(session.wallet, url, session.identityKey, {
        label,
        providerName,
        providerIdentity: providerKey,
        amountSats
      })
      setJobId(result.jobId)
      setHintTxid(result.txid)
      goToJob(result.jobId, result.txid)
      setNotice(result.overlayError
        ? `Job funded. Overlay submit failed: ${result.overlayError}`
        : 'Job funded. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.jobId, result.txid)
    } catch (err) {
      console.error('Fund job failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runSubmit = async (): Promise<void> => {
    setLastAction('submit')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!fund) {
      setActionError('This job wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('submit')
    try {
      const result = await submitHash(session.wallet, url, session.identityKey, fund, deliverableHash)
      setHintTxid(result.txid)
      goToJob(result.jobId, result.txid)
      setNotice(result.overlayError
        ? `Hash submitted. Overlay submit failed: ${result.overlayError}`
        : 'Hash submitted. Waiting for release.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.jobId, result.txid)
    } catch (err) {
      console.error('Submit hash failed', err)
      setActionError(errorMessage(err) === 'This wallet isn’t the named provider.' ? NOT_PROVIDER : errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRelease = async (): Promise<void> => {
    setLastAction('release')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!fund) {
      setActionError('This job wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('release')
    try {
      const result = await releaseJob(session.wallet, url, session.identityKey, fund)
      setHintTxid(result.txid)
      goToJob(result.jobId, result.txid)
      setNotice(result.overlayError
        ? `Released. Overlay submit failed: ${result.overlayError}`
        : 'Released. The lock is open.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.jobId, result.txid)
    } catch (err) {
      console.error('Release job failed', err)
      setActionError(errorMessage(err) === 'This wallet didn’t fund the job.' ? NOT_CLIENT : errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runChallenge = async (): Promise<void> => {
    setLastAction('challenge')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!fund) {
      setActionError('This job wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('challenge')
    try {
      const result = await challengeJob(session.wallet, url, session.identityKey, fund)
      setHintTxid(result.txid)
      goToJob(result.jobId, result.txid)
      setNotice(result.overlayError
        ? `Challenged. Overlay submit failed: ${result.overlayError}`
        : 'Challenged. Refund when you are ready.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.jobId, result.txid)
    } catch (err) {
      console.error('Challenge job failed', err)
      setActionError(errorMessage(err) === 'This wallet didn’t fund the job.' ? NOT_CLIENT : errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRefund = async (): Promise<void> => {
    setLastAction('refund')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!fund) {
      setActionError('This job wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('refund')
    try {
      const result = await refundJob(session.wallet, url, session.identityKey, fund)
      setHintTxid(result.txid)
      goToJob(result.jobId, result.txid)
      setNotice(result.overlayError
        ? `Refunded. Overlay submit failed: ${result.overlayError}`
        : 'Refunded. The lock came back.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.jobId, result.txid)
    } catch (err) {
      console.error('Refund job failed', err)
      setActionError(errorMessage(err) === 'This wallet didn’t fund the job.' ? NOT_CLIENT : errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'submit') void runSubmit()
    else if (lastAction === 'release') void runRelease()
    else if (lastAction === 'challenge') void runChallenge()
    else if (lastAction === 'refund') void runRefund()
    else void runFund()
  }

  const copyLink = async (): Promise<void> => {
    const id = fund?.jobId || jobId
    if (!id) return
    await navigator.clipboard.writeText(jobPublicUrl(id, hintTxid || fund?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const stamp = status ? stampFor(status) : null

  return (
    <div className="room">
      <div className={`scene-crop ${fund ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A shop clerk writing a work order on a yellow job ticket."
          width="1600"
          height="1067"
        />
      </div>
      <div className="app">
        <article className="ticket">
          <header className="ticket-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{title}</h1>
            <p className="lede">{JOB}</p>
          </header>

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!jobId && (
            <section className="block">
              <p className="job">{FUND_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="label">Label</label>
                  <input
                    id="label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder={DEFAULT_LABEL}
                    maxLength={80}
                  />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="provider">Provider</label>
                    <input
                      id="provider"
                      value={providerName}
                      onChange={(event) => setProviderName(event.target.value)}
                      placeholder={DEFAULT_PROVIDER_NAME}
                      maxLength={80}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="amount">Amount</label>
                    <input
                      id="amount"
                      inputMode="numeric"
                      className="amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runFund()}
                >
                  {busy === 'fund' ? FUNDING_BUTTON : FUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {jobId && !fund && !listBusy && (
            <p className="empty">{lookupError || 'This job wasn’t found.'}</p>
          )}

          {fund && (
            <section className="block">
              {stamp && (
                <div className="show-hero">
                  <span className={`stamp ${stampClass(stamp)} fat`}>{stamp}</span>
                </div>
              )}
              <h2>{fund.label}</h2>
              <dl className="meta">
                <div>
                  <dt>Provider</dt>
                  <dd>{fund.providerName}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd className="amount">{formatAmount(fund.amountSats)}</dd>
                </div>
                {submit && (
                  <div>
                    <dt>Hash</dt>
                    <dd>{hashFace(submit)}</dd>
                  </div>
                )}
                {submittedAt && (
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatWhen(submittedAt)}</dd>
                  </div>
                )}
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </section>
          )}

          {fund && canSubmit(status) && (
            <section className="slip">
              <p className="job">{SUBMIT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="hash">Deliverable hash</label>
                  <input
                    id="hash"
                    value={deliverableHash}
                    onChange={(event) => setDeliverableHash(event.target.value)}
                    placeholder="Paste the hash"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runSubmit()}
                >
                  {busy === 'submit' ? SUBMITTING_BUTTON : SUBMIT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {fund && (canRelease(status) || canChallenge(status) || canRefund(status)) && (
            <section className="slip">
              {canRelease(status) && <p className="job">{RELEASE_JOB}</p>}
              <div className="actions">
                {canRelease(status) && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting || overlayDown}
                    onClick={() => void runRelease()}
                  >
                    {busy === 'release' ? RELEASING_BUTTON : RELEASE_BUTTON}
                  </button>
                )}
                {canChallenge(status) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || connecting || overlayDown}
                    onClick={() => void runChallenge()}
                  >
                    {busy === 'challenge' ? CHALLENGING_BUTTON : CHALLENGE_BUTTON}
                  </button>
                )}
                {canRefund(status) && (
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy !== null || connecting || overlayDown}
                    onClick={() => void runRefund()}
                  >
                    {busy === 'refund' ? REFUNDING_BUTTON : REFUND_BUTTON}
                  </button>
                )}
              </div>
            </section>
          )}

          {notice && <p className="status ok">{notice}</p>}
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
          <p>Amounts are in sats.</p>
          <p>{FEE_STORY}</p>
          <label htmlFor="provider-key">Provider key</label>
          <input
            id="provider-key"
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value)}
            placeholder="Compressed pubkey"
            spellCheck={false}
          />
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {jobId && (
            <p>
              Job id <code>{jobId}</code>
            </p>
          )}
          {(hintTxid || fund?.txid) && (
            <p>
              Transaction <code>{hintTxid || fund?.txid}</code>
            </p>
          )}
          {fund?.providerIdentity && (
            <p>
              Provider key <code>{shortKey(fund.providerIdentity, 8)}</code>
            </p>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer.</p>
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
