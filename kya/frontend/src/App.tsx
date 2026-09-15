import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_AGENT_NAME,
  DEFAULT_OWNER_NAME,
  DEFAULT_VERIFY_SATS,
  canIssue,
  canVerify,
  sheetTitle,
  type KyaStatus
} from '../../protocol/kya'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanRegister,
  issueCredential,
  registerAgent,
  verifyAgent
} from './lib/actions'
import {
  EYEBROW,
  FEE_LINE,
  ISSUE_BUTTON,
  ISSUE_JOB,
  ISSUING_BUTTON,
  JOB,
  NOT_OWNER,
  REGISTER_BUTTON,
  REGISTER_JOB,
  REGISTERING_BUTTON,
  STRANGER_LINE,
  VERIFY_BUTTON,
  VERIFY_JOB,
  VERIFYING_BUTTON,
  feeStory,
  formatWhen,
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
import { lookupAgent, type OverlayBind } from './lib/overlay'
import { agentPublicUrl, goToAgent, readAgentFromLocation } from './lib/route'

type Busy = 'register' | 'issue' | 'verify' | null

function stampClass(label: string): string {
  if (label === 'Verified') return 'verified'
  if (label === 'Issued') return 'issued'
  return 'bound'
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readAgentFromLocation(), [])
  const [agentId, setAgentId] = useState(initial.agentId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [bind, setBind] = useState<OverlayBind | null>(null)
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [issuedAt, setIssuedAt] = useState<string | null>(null)
  const [receiptCount, setReceiptCount] = useState(0)
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<KyaStatus | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [agentName, setAgentName] = useState(DEFAULT_AGENT_NAME)
  const [ownerName, setOwnerName] = useState(DEFAULT_OWNER_NAME)
  const [verifySats, setVerifySats] = useState(String(DEFAULT_VERIFY_SATS))

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('register')
  const [copied, setCopied] = useState(false)

  const overlayDown = online === false
  const title = sheetTitle(status)

  const refresh = async (id = agentId, txid = hintTxid): Promise<void> => {
    if (!id) {
      setBind(null)
      setCredentialId(null)
      setIssuedAt(null)
      setReceiptCount(0)
      setLastVerifiedAt(null)
      setStatus(null)
      setLookupError(null)
      return
    }
    setListBusy(true)
    try {
      const view = await lookupAgent(url, id, txid || undefined)
      setBind(view.bind)
      setCredentialId(view.credential?.credentialId ?? null)
      setIssuedAt(view.credential?.issuedAt ?? null)
      setReceiptCount(view.receipts.length)
      setLastVerifiedAt(view.receipts[0]?.verifiedAt ?? null)
      setStatus(view.status)
      setLookupError(view.bind ? null : 'This agent wasn’t found.')
    } catch {
      setBind(null)
      setCredentialId(null)
      setIssuedAt(null)
      setReceiptCount(0)
      setLastVerifiedAt(null)
      setStatus(null)
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, agentId, hintTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runRegister = async (): Promise<void> => {
    setLastAction('register')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    try {
      assertCanRegister({ agentName, ownerName })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('register')
    try {
      const result = await registerAgent(session.wallet, url, session.identityKey, {
        agentName,
        ownerName
      })
      setAgentId(result.agentId)
      setHintTxid(result.txid)
      goToAgent(result.agentId, result.txid)
      setNotice(result.overlayError
        ? `Agent registered. Overlay submit failed: ${result.overlayError}`
        : 'Agent registered. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.agentId, result.txid)
    } catch (err) {
      console.error('Register agent failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runIssue = async (): Promise<void> => {
    setLastAction('issue')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!bind) {
      setActionError('This agent wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('issue')
    try {
      const result = await issueCredential(session.wallet, url, session.identityKey, bind)
      setHintTxid(result.txid)
      goToAgent(result.agentId, result.txid)
      setNotice(result.overlayError
        ? `Credential issued. Overlay submit failed: ${result.overlayError}`
        : 'Credential issued.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.agentId, result.txid)
    } catch (err) {
      console.error('Issue credential failed', err)
      setActionError(errorMessage(err) === NOT_OWNER ? NOT_OWNER : errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runVerify = async (): Promise<void> => {
    setLastAction('verify')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!bind) {
      setActionError('This agent wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    const view = await lookupAgent(url, bind.agentId, hintTxid || undefined)
    if (!view.credential) {
      setActionError('Issue the credential before anyone can verify.')
      return
    }
    setBusy('verify')
    try {
      const feeSats = Number(verifySats.replace(/,/g, '')) || DEFAULT_VERIFY_SATS
      const result = await verifyAgent(
        session.wallet,
        url,
        session.identityKey,
        view.bind ?? bind,
        view.credential,
        { feeSats, verifierName: '' }
      )
      setHintTxid(result.txid)
      goToAgent(result.agentId, result.txid)
      setNotice(result.overlayError
        ? `Verified. Overlay submit failed: ${result.overlayError}`
        : 'Verified. The receipt is on overlay.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.agentId, result.txid)
    } catch (err) {
      console.error('Verify agent failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'issue') void runIssue()
    else if (lastAction === 'verify') void runVerify()
    else void runRegister()
  }

  const copyLink = async (): Promise<void> => {
    const id = bind?.agentId || agentId
    if (!id) return
    await navigator.clipboard.writeText(agentPublicUrl(id, hintTxid || bind?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const stamp = status ? stampFor(status) : null
  const feeSats = Number(verifySats.replace(/,/g, '')) || DEFAULT_VERIFY_SATS

  return (
    <div className="lounge">
      <div className={`scene-crop ${bind ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A verifier confirming a holographic agent pass in a violet glass lounge."
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="pass">
          <header className="pass-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{title}</h1>
            <p className="lede">{JOB}</p>
          </header>

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!agentId && (
            <section className="block">
              <p className="job">{REGISTER_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="agent">Agent</label>
                  <input
                    id="agent"
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                    placeholder={DEFAULT_AGENT_NAME}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="owner">Owner</label>
                  <input
                    id="owner"
                    value={ownerName}
                    onChange={(event) => setOwnerName(event.target.value)}
                    placeholder={DEFAULT_OWNER_NAME}
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runRegister()}
                >
                  {busy === 'register' ? REGISTERING_BUTTON : REGISTER_BUTTON}
                </button>
              </div>
            </section>
          )}

          {agentId && !bind && !listBusy && (
            <p className="empty">{lookupError || 'This agent wasn’t found.'}</p>
          )}

          {bind && (
            <section className="block">
              {stamp && (
                <div className="show-hero">
                  <span className={`stamp ${stampClass(stamp)} fat`}>{stamp}</span>
                </div>
              )}
              <h2>{bind.agentName}</h2>
              <dl className="meta">
                <div>
                  <dt>Owner</dt>
                  <dd>{bind.ownerName}</dd>
                </div>
                {issuedAt && (
                  <div>
                    <dt>Issued</dt>
                    <dd>{formatWhen(issuedAt)}</dd>
                  </div>
                )}
                {lastVerifiedAt && (
                  <div>
                    <dt>Last verified</dt>
                    <dd>{formatWhen(lastVerifiedAt)}</dd>
                  </div>
                )}
                {receiptCount > 0 && (
                  <div>
                    <dt>Receipts</dt>
                    <dd>{receiptCount}</dd>
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

          {bind && canIssue(status) && (
            <section className="slip">
              <p className="job">{ISSUE_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runIssue()}
                >
                  {busy === 'issue' ? ISSUING_BUTTON : ISSUE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {bind && canVerify(status) && (
            <section className="slip">
              <p className="job">{VERIFY_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runVerify()}
                >
                  {busy === 'verify' ? VERIFYING_BUTTON : VERIFY_BUTTON}
                </button>
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
          <p>{FEE_LINE}</p>
          <p>{feeStory(feeSats)}</p>
          <label htmlFor="verify-sats">Verify fee</label>
          <input
            id="verify-sats"
            inputMode="numeric"
            value={verifySats}
            onChange={(event) => setVerifySats(event.target.value)}
          />
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {agentId && (
            <p>
              Agent id <code>{agentId}</code>
            </p>
          )}
          {credentialId && (
            <p>
              Credential <code>{shortKey(credentialId, 8)}</code>
            </p>
          )}
          {(hintTxid || bind?.txid) && (
            <p>
              Transaction <code>{hintTxid || bind?.txid}</code>
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
