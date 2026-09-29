import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COVER_KINDS,
  DEFAULT_COVER_KIND,
  DEFAULT_INSURED_SATS,
  DEFAULT_QUORUM,
  DEFAULT_SUBJECT,
  DEFAULT_TERM_DAYS,
  formatSats,
  hashEvidenceText,
  isCoverKind,
  parseInsured,
  parseTermDays,
  quoteCover
} from '../../protocol/cover'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  approveClaim,
  assertCanBuy,
  buyCover,
  downloadReading,
  fileClaim,
  hashPickedFile,
  releaseClaim
} from './lib/actions'
import {
  APPROVE_BUTTON,
  APPROVE_JOB,
  APPROVER_HINT,
  APPROVING_BUTTON,
  BUY_BUTTON,
  BUYING_BUTTON,
  BUY_JOB,
  CLAIM_ADMIN_LABEL,
  DESK_DEFAULT,
  DISTINCT_LINE,
  EMPTY_LIST,
  EVIDENCE_TRIM,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  FILE_BUTTON,
  FILE_JOB,
  FILING_BUTTON,
  HONESTY_LINE,
  JOB,
  NEED_EVIDENCE,
  PAYOUT_NOTE,
  PREMIUM_CUT_LABEL,
  PREMIUM_LABEL,
  PRODUCT,
  QUOTE_WAIT,
  RECORDED_ONLY,
  RELEASED_WORD,
  RELEASE_BUTTON,
  RELEASE_JOB,
  RELEASING_BUTTON,
  STRANGER_LINE,
  approvalLine,
  claimAdminFace,
  coverKindLabel,
  formatWhen
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupCoverItems, lookupPolicy, policiesFromItems, type OverlayPolicy, type PolicyView } from './lib/overlay'
import { goHome, goToPolicy, parsePolicyLink, policyPublicUrl, readPolicyFromLocation } from './lib/route'

type Busy = 'buy' | 'claim' | 'approve' | 'release' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect, clearError } = useWallet()

  const initial = useMemo(() => readPolicyFromLocation(), [])
  const [policyId, setPolicyId] = useState(initial.policyId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [view, setView] = useState<PolicyView | null>(null)
  const [listed, setListed] = useState<OverlayPolicy[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [kind, setKind] = useState(DEFAULT_COVER_KIND)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [insured, setInsured] = useState(String(DEFAULT_INSURED_SATS))
  const [termDays, setTermDays] = useState(String(DEFAULT_TERM_DAYS))
  const [quorum, setQuorum] = useState(String(DEFAULT_QUORUM))
  const [approver1, setApprover1] = useState('')
  const [approver2, setApprover2] = useState('')
  const [approver3, setApprover3] = useState('')
  const [desk, setDesk] = useState('')
  const [openLink, setOpenLink] = useState('')

  const [evidenceText, setEvidenceText] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [fileNote, setFileNote] = useState('')
  const [payout, setPayout] = useState('')

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('buy')
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const overlayDown = online === false
  const policy = view?.policy ?? null
  const folded = view?.claims[0] ?? null
  const showInstall = walletMissing || actionNeedsInstall

  const quote = useMemo(() => {
    const insuredSats = parseInsured(insured)
    const term = parseTermDays(termDays)
    if (!isCoverKind(kind) || insuredSats === null || term === null) return null
    return quoteCover(kind, insuredSats, term)
  }, [kind, insured, termDays])

  const evidenceHash = fileHash || (evidenceText.trim() ? hashEvidenceText(evidenceText) : '')
  const evidenceNote = fileHash ? fileNote : (evidenceHash ? 'Evidence is marked. Nothing was uploaded.' : '')

  const refresh = async (id = policyId, txid = hintTxid): Promise<void> => {
    setListBusy(true)
    try {
      if (id) {
        const next = await lookupPolicy(url, id, txid || undefined)
        setView(next)
        setLookupError(next.policy ? null : 'This policy wasn’t found.')
        return
      }
      const items = await lookupCoverItems(url)
      setListed(policiesFromItems(items))
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
  }, [url, policyId, hintTxid])

  useEffect(() => {
    if (!policy) return
    setPayout(String(policy.insuredSats))
  }, [policy?.policyId])

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

  const runBuy = async (): Promise<void> => {
    setLastAction('buy')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    try {
      assertCanBuy({
        coverKind: kind,
        subject,
        insured,
        termDays,
        quorum,
        approver1,
        approver2,
        approver3,
        desk
      }, identityKey || `02${'ee'.repeat(32)}`)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('buy')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await buyCover(session.wallet, url, session.identityKey, {
        coverKind: kind,
        subject,
        insured,
        termDays,
        quorum,
        approver1,
        approver2,
        approver3,
        desk
      })
      setPolicyId(result.policyId)
      setHintTxid(result.txid)
      goToPolicy(result.policyId, result.txid)
      setNotice(result.overlayError
        ? `Cover bought. Overlay submit failed: ${result.overlayError}`
        : 'Cover bought. Share the policy link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.policyId, result.txid)
    } catch (err) {
      console.error('Buy cover failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runFile = async (): Promise<void> => {
    setLastAction('claim')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!policy) {
      setActionError('This policy wasn’t found.')
      return
    }
    if (!evidenceHash) {
      setActionError(NEED_EVIDENCE)
      return
    }
    setBusy('claim')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupPolicy(url, policy.policyId, hintTxid || policy.txid)
      const book = current.policy ?? policy
      const result = await fileClaim(session.wallet, url, session.identityKey, book, current.claims, {
        evidenceHash,
        payout
      })
      setHintTxid(result.txid)
      goToPolicy(result.policyId, result.txid)
      setNotice(result.overlayError
        ? `Claim filed. Overlay submit failed: ${result.overlayError}`
        : 'Claim filed. Approvers can agree from this link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.policyId, result.txid)
    } catch (err) {
      console.error('File claim failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runApprove = async (): Promise<void> => {
    setLastAction('approve')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!policy || !folded) {
      setActionError('File a claim first.')
      return
    }
    setBusy('approve')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupPolicy(url, policy.policyId, hintTxid || policy.txid)
      const book = current.policy ?? policy
      const live = current.claims[0] ?? folded
      const result = await approveClaim(session.wallet, url, session.identityKey, book, live)
      setHintTxid(result.txid)
      goToPolicy(result.policyId, result.txid)
      setNotice(result.overlayError
        ? `Approved. Overlay submit failed: ${result.overlayError}`
        : 'Approved.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.policyId, result.txid)
    } catch (err) {
      console.error('Approve failed', err)
      setActionError(errorMessage(err))
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
    if (!policy || !folded) {
      setActionError('File a claim first.')
      return
    }
    setBusy('release')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupPolicy(url, policy.policyId, hintTxid || policy.txid)
      const book = current.policy ?? policy
      const live = current.claims[0] ?? folded
      const result = await releaseClaim(session.wallet, url, session.identityKey, book, live)
      setHintTxid(result.txid)
      goToPolicy(result.policyId, result.txid)
      setNotice(result.overlayError
        ? `Released. Overlay submit failed: ${result.overlayError}`
        : 'Released.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.policyId, result.txid)
    } catch (err) {
      console.error('Release failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runExport = (): void => {
    if (!policy || !view) return
    downloadReading(policy, view.claims)
    setNotice('Reading exported.')
    setActionError(null)
  }

  const runOpen = (): void => {
    const parsed = parsePolicyLink(openLink)
    if (!parsed.policyId) {
      setActionError('Paste a policy link.')
      return
    }
    setActionError(null)
    setNotice(null)
    clearError()
    setPolicyId(parsed.policyId)
    setHintTxid(parsed.hintTxid ?? '')
    goToPolicy(parsed.policyId, parsed.hintTxid)
  }

  const openListed = (row: OverlayPolicy): void => {
    setActionError(null)
    setNotice(null)
    clearError()
    setPolicyId(row.policyId)
    setHintTxid(row.txid)
    goToPolicy(row.policyId, row.txid)
  }

  const runHome = (): void => {
    setPolicyId('')
    setHintTxid('')
    setView(null)
    setActionError(null)
    setNotice(null)
    goHome()
  }

  const retry = (): void => {
    if (lastAction === 'claim') void runFile()
    else if (lastAction === 'approve') void runApprove()
    else if (lastAction === 'release') void runRelease()
    else void runBuy()
  }

  const copyLink = async (): Promise<void> => {
    const id = policy?.policyId || policyId
    if (!id) return
    await navigator.clipboard.writeText(policyPublicUrl(id, hintTxid || policy?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const onEvidenceFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const hash = await hashPickedFile(file)
      setFileHash(hash)
      setFileNote(`${file.name} is marked on this device. It was not uploaded.`)
      setActionError(null)
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  const combinedError = actionError || walletError

  return (
    <div className="desk">
      <div className={`scene-crop ${policy ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A blonde woman at a bright modern desk reviews a policy card on her phone, with a tablet showing a 2-of-3 approval and a bullet train and EV chargers behind her."
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

          {!policyId && (
            <section className="block">
              <p className="job">{BUY_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="cover-kind">Cover kind</label>
                  <select id="cover-kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                    {COVER_KINDS.map((option) => (
                      <option key={option} value={option}>{coverKindLabel(option)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="subject">What it covers</label>
                  <input
                    id="subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder={DEFAULT_SUBJECT}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="insured">Insured amount</label>
                  <input
                    id="insured"
                    value={insured}
                    onChange={(event) => setInsured(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="term">Term (days)</label>
                  <input
                    id="term"
                    value={termDays}
                    onChange={(event) => setTermDays(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="quorum">Approvals needed</label>
                  <select id="quorum" value={quorum} onChange={(event) => setQuorum(event.target.value)}>
                    <option value="2">2 of 3</option>
                    <option value="3">3 of 3</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="approver-1">Approver 1</label>
                  <input
                    id="approver-1"
                    value={approver1}
                    onChange={(event) => setApprover1(event.target.value)}
                    placeholder="02 then 64 hex characters"
                  />
                </div>
                <div className="field">
                  <label htmlFor="approver-2">Approver 2</label>
                  <input
                    id="approver-2"
                    value={approver2}
                    onChange={(event) => setApprover2(event.target.value)}
                    placeholder="02 then 64 hex characters"
                  />
                </div>
                <div className="field">
                  <label htmlFor="approver-3">Approver 3</label>
                  <input
                    id="approver-3"
                    value={approver3}
                    onChange={(event) => setApprover3(event.target.value)}
                    placeholder="02 then 64 hex characters"
                  />
                </div>
              </div>
              <p className="helper">{APPROVER_HINT}</p>
              {quote ? (
                <dl className="quote">
                  <div>
                    <dt>{PREMIUM_LABEL}</dt>
                    <dd>{formatSats(quote.premiumSats)}</dd>
                  </div>
                  <div>
                    <dt>{PREMIUM_CUT_LABEL}</dt>
                    <dd>{formatSats(quote.premiumCutSats)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="helper">{QUOTE_WAIT}</p>
              )}
              <p className="helper">{FEE_FACE}</p>
              <p className="helper">{DESK_DEFAULT}</p>
              <p className="helper">{RECORDED_ONLY}</p>
              <p className="helper">{DISTINCT_LINE}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runBuy()}
                >
                  {busy === 'buy' ? BUYING_BUTTON : BUY_BUTTON}
                </button>
              </div>
              <div className="field open-link">
                <label htmlFor="open-link">Open a policy</label>
                <input
                  id="open-link"
                  value={openLink}
                  onChange={(event) => setOpenLink(event.target.value)}
                  placeholder="Paste a policy link"
                />
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={runOpen}>
                  Open
                </button>
              </div>
              <p className="job holdings-label">Policies</p>
              {lookupError && <p className="status err">{lookupError}</p>}
              {listed.length === 0 && !lookupError && <p className="empty">{listBusy ? 'Loading…' : EMPTY_LIST}</p>}
              {listed.length > 0 && (
                <ul className="holdings">
                  {listed.map((row) => (
                    <li key={row.policyId}>
                      <button type="button" className="text-btn" onClick={() => openListed(row)}>
                        {row.subject}
                      </button>
                      <span>{coverKindLabel(row.coverKind)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {policyId && !policy && !listBusy && (
            <p className="empty">{lookupError || 'This policy wasn’t found.'}</p>
          )}

          {policy && (
            <section className="block">
              <h2>{policy.subject}</h2>
              <dl className="meta">
                <div>
                  <dt>Cover</dt>
                  <dd>{coverKindLabel(policy.coverKind)}</dd>
                </div>
                <div>
                  <dt>Insured</dt>
                  <dd>{formatSats(policy.insuredSats)}</dd>
                </div>
                <div>
                  <dt>{PREMIUM_LABEL}</dt>
                  <dd>{formatSats(policy.premiumSats)}</dd>
                </div>
                <div>
                  <dt>{PREMIUM_CUT_LABEL}</dt>
                  <dd>{formatSats(policy.premiumCutSats)}</dd>
                </div>
                <div>
                  <dt>Term</dt>
                  <dd>{policy.termDays} days, through {formatWhen(policy.endsAt)}</dd>
                </div>
                <div>
                  <dt>Approvals needed</dt>
                  <dd>{policy.quorum} of 3</dd>
                </div>
                <div>
                  <dt>Bought</dt>
                  <dd>{formatWhen(policy.boughtAt)}</dd>
                </div>
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{FEE_FACE}</p>
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
                  Buy another
                </button>
              </div>
            </section>
          )}

          {policy && !folded && (
            <section className="slip">
              <p className="job">{FILE_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="evidence">What happened</label>
                  <textarea
                    id="evidence"
                    value={evidenceText}
                    onChange={(event) => {
                      setEvidenceText(event.target.value)
                      setFileHash('')
                      setFileNote('')
                    }}
                    rows={4}
                    placeholder="Paste a note. Or pick a file. Nothing is uploaded. The note is trimmed before hashing."
                  />
                </div>
                <div className="field">
                  <label htmlFor="evidence-file">Or pick a file</label>
                  <input
                    id="evidence-file"
                    type="file"
                    onChange={(event) => void onEvidenceFile(event.target.files?.[0])}
                  />
                </div>
                <div className="field">
                  <label htmlFor="payout">Payout</label>
                  <input
                    id="payout"
                    value={payout}
                    onChange={(event) => setPayout(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              {evidenceNote && <p className="helper">{evidenceNote}</p>}
              <p className="helper">{EVIDENCE_TRIM}</p>
              <p className="helper">{claimAdminFace()}</p>
              <p className="helper">{RECORDED_ONLY}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runFile()}
                >
                  {busy === 'claim' ? FILING_BUTTON : FILE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {policy && folded && folded.status !== 'released' && (
            <section className="slip">
              <p className="job">{APPROVE_JOB}</p>
              <p className="helper">{approvalLine(folded.approvalCount, policy.quorum)}</p>
              <p className="helper">{claimAdminFace()}</p>
              <p className="helper">{RECORDED_ONLY}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runApprove()}
                >
                  {busy === 'approve' ? APPROVING_BUTTON : APPROVE_BUTTON}
                </button>
              </div>
              <p className="job release-job">{RELEASE_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown || !folded.quorumMet}
                  onClick={() => void runRelease()}
                >
                  {busy === 'release' ? RELEASING_BUTTON : RELEASE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {policy && folded?.status === 'released' && folded.release && (
            <section className="slip released">
              <p className="status ok">{RELEASED_WORD}</p>
              <dl className="quote">
                <div>
                  <dt>Payout</dt>
                  <dd>{formatSats(folded.release.payoutSats)}</dd>
                </div>
                <div>
                  <dt>{CLAIM_ADMIN_LABEL}</dt>
                  <dd>{formatSats(folded.release.claimAdminFeeSats)}</dd>
                </div>
              </dl>
              <p className="helper">{PAYOUT_NOTE}</p>
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
          <p>{HONESTY_LINE}</p>
          <p>Leave the desk key blank to pay the premium and the claim-admin fee to this wallet.</p>
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
          {policyId && (
            <p>
              Policy id <code>{policyId}</code>
            </p>
          )}
          {evidenceHash && (
            <p>
              Evidence mark <code>{evidenceHash}</code>
            </p>
          )}
          {(hintTxid || policy?.txid) && (
            <p>
              Transaction <code>{hintTxid || policy?.txid}</code>
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
