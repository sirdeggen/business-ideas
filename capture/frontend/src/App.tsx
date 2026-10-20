import { useEffect, useMemo, useRef, useState } from 'react'
import {
  boardStats,
  emptyDesk,
  escrowKeyId,
  isGeohash,
  nowIso,
  payoutLines,
  postRequest,
  refundCapture,
  submitCapture,
  type DeskState
} from '../../protocol/capture'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  acceptOnChain,
  findHeldEscrow,
  fundCapture,
  hashFile,
  heldEscrow,
  parseWhole,
  refundOnChain,
  submitCaptureOnChain
} from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  ACCEPT_BUTTON,
  ACCEPT_JOB,
  ACCEPTING_BUTTON,
  AGENT_402_CURL,
  AGENT_402_NOTE,
  AGENT_402_TITLE,
  BOARD_EMPTY,
  BOARD_HEADING,
  BOARD_NOTE,
  BRIEF_LABEL,
  DEADLINE_LABEL,
  DESK_NOTE,
  DRAFT_JOB,
  EYEBROW,
  FEE_HELPER,
  FILE_LABEL,
  FOOTER,
  FUND_BUTTON,
  FUND_JOB,
  FUNDING_BUTTON,
  GEOHASH_LABEL,
  HASH_NOTE,
  HOST_ASSERTED_LABEL,
  LATE_CAPTURE,
  LEDE,
  LINE_CONTRIBUTOR,
  LINE_DESK,
  LINE_PROCESSING,
  LINE_REWARD,
  LOCAL_NOTE,
  LOCATION_LABEL,
  PENDING_CAPTURE,
  PREVIEW_LABEL,
  PROCESSING_LABEL,
  REFRESH_BUTTON,
  REFUND_BUTTON,
  REFUND_JOB,
  REFUNDING_BUTTON,
  REWARD_LABEL,
  SCENE_ALT,
  SCRIPT_NOTE,
  STRANGER_LINE,
  SUBMIT_BUTTON,
  SUBMIT_JOB,
  SUBMITTING_BUTTON,
  TITLE,
  deadlineFromLocal,
  deadlineLocalValue,
  formatAmount,
  formatMedian,
  formatRate,
  formatWhen
} from './lib/copy'
import { boardFromItems, lookupCapture, lookupCaptureItems, type OverlayItem } from './lib/overlay'
import { clearDesk, loadDesk, loadFundTx, saveDesk, saveFundTx } from './lib/persist'
import { captureHref, capturePublicUrl, goHome, goToCapture, readCaptureFromLocation } from './lib/route'
import type { ListedRequest } from '../../protocol/capture'

type Busy = 'fund' | 'submit' | 'accept' | 'refund' | null

function defaultDeadline(): string {
  return deadlineLocalValue(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString())
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readCaptureFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [pinIdentity, setPinIdentity] = useState(initial.pinIdentity ?? '')
  const [location, setLocation] = useState('')
  const [brief, setBrief] = useState('')
  const [reward, setReward] = useState('100000')
  const [processing, setProcessing] = useState('1000')
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [file, setFile] = useState<File | null>(null)
  const [geohash, setGeohash] = useState('')
  const [preview, setPreview] = useState('')
  const [receiptHash, setReceiptHash] = useState('')
  const [board, setBoard] = useState<ListedRequest[]>([])
  const [boardError, setBoardError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const request = desk.request
  const stats = boardStats(board)

  const draftSplit = useMemo(() => {
    const rewardSats = parseWhole(reward)
    const processingFeeSats = parseWhole(processing)
    if (rewardSats == null || processingFeeSats == null) return null
    try {
      return payoutLines(rewardSats, processingFeeSats)
    } catch {
      return null
    }
  }, [reward, processing])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!request || readonly) return
    saveDesk(request.requestId, desk)
  }, [desk, request, readonly])

  const applyItems = (items: OverlayItem[], pin = pinIdentity): void => {
    setBoard(boardFromItems(items, pin || null))
    setBoardError(null)
  }

  useEffect(() => {
    let cancel = false
    void lookupCaptureItems(url)
      .then((items) => {
        if (!cancel) applyItems(items)
      })
      .catch(() => {
        if (!cancel) setBoardError('The board didn’t load.')
      })
    return () => {
      cancel = true
    }
  }, [url, pinIdentity])

  useEffect(() => {
    const located = readCaptureFromLocation()
    if (located.pinIdentity) setPinIdentity(located.pinIdentity)
    if (located.hintTxid) setHintTxid(located.hintTxid)
    if (!located.requestId) return
    const local = loadDesk(located.requestId)
    if (local?.request) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupCapture(url, located.requestId, located.hintTxid ?? undefined, located.pinIdentity || pinIdentity || undefined)
      .then((remote) => {
        if (cancel || !remote?.request) return
        setDesk(remote)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This request wasn’t found.')
      })
    return () => {
      cancel = true
    }
  }, [url])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const fail = (err: unknown): void => {
    setActionError(errorMessage(err))
    setActionNeedsInstall(false)
  }

  const refreshBoard = (): void => {
    void lookupCaptureItems(url)
      .then((items) => applyItems(items))
      .catch(() => setBoardError('The board didn’t load.'))
  }

  const openListed = (row: ListedRequest): void => {
    const local = loadDesk(row.requestId)
    if (local?.request) {
      setDesk(local)
      setReadonly(false)
    } else {
      setDesk({
        ...emptyDesk(),
        request: row.request,
        submissions: row.submissions,
        pendingSubmissions: row.pendingSubmissions,
        lateSubmissions: row.lateSubmissions,
        accept: row.accept,
        refund: row.refund,
        pendingRefund: row.pendingRefund,
        earlyRefund: row.earlyRefund
      })
      setReadonly(true)
    }
    setPinIdentity(row.request.requesterIdentity)
    setHintTxid(row.txid)
    setReceiptHash(row.submissions[0]?.receiptHash ?? '')
    goToCapture(row.requestId, row.request.requesterIdentity, row.txid)
  }

  const runFund = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    let draft: DeskState
    try {
      draft = postRequest({
        location,
        brief,
        rewardSats: parseWhole(reward) ?? -1,
        processingFeeSats: parseWhole(processing) ?? -1,
        deadline: deadlineFromLocal(deadline)
      })
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('fund')
    try {
      const result = await fundCapture(session.wallet, url, session.identityKey, draft)
      setDesk(result.desk)
      setReadonly(false)
      setPinIdentity(result.requesterIdentity)
      setHintTxid(result.txid)
      saveFundTx(result.requestId, { txid: result.txid, tx: result.tx, lockingScript: result.lockingScript })
      goToCapture(result.requestId, result.requesterIdentity, result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupCaptureItems(url).catch(() => null)
      if (items) applyItems(items, result.requesterIdentity)
    } catch (err) {
      console.error('Fund capture failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runSubmit = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      if (!desk.request) throw new Error('Fund a request first.')
      if (!file) throw new Error('Choose the capture file. It stays on this device.')
      if (!isGeohash(geohash)) throw new Error('Coarse location is a 5-character geohash.')
      if (!preview.trim()) throw new Error('Write the watermarked preview.')
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session || !file || !desk.request) return
    setBusy('submit')
    try {
      const hash = await hashFile(file)
      const drafted = submitCapture(desk, {
        contributorIdentity: session.identityKey,
        receiptHash: hash,
        capturedAt: nowIso(),
        geohash,
        submittedAt: nowIso()
      })
      const submission = drafted.pendingSubmissions[drafted.pendingSubmissions.length - 1]
      if (!submission) throw new Error('Capture receipt is missing.')
      const result = await submitCaptureOnChain(
        session.wallet,
        url,
        session.identityKey,
        drafted,
        submission,
        preview,
        desk.request.requesterIdentity
      )
      setDesk(result.desk)
      setReceiptHash(hash)
      setActionError(result.overlayError ?? null)
      const items = await lookupCaptureItems(url).catch(() => null)
      if (items) applyItems(items)
    } catch (err) {
      console.error('Submit capture failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const loadEscrow = async (session: { wallet: NonNullable<typeof wallet> }) => {
    if (!desk.request) throw new Error('Fund a request first.')
    const found = await findHeldEscrow(session.wallet, desk.request.requestId, desk.request.rewardSats).catch(() => null)
    if (found) return found
    const stored = loadFundTx(desk.request.requestId)
    if (!stored) throw new Error('This browser does not have the locked reward.')
    return heldEscrow(stored.tx, stored.lockingScript, escrowKeyId(desk.request.requestId), desk.request.rewardSats, stored.txid)
  }

  const runAccept = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      if (!desk.request) throw new Error('Fund a request first.')
      if (!receiptHash) throw new Error('Choose a capture to accept.')
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('accept')
    try {
      const held = await loadEscrow(session)
      const result = await acceptOnChain(session.wallet, url, session.identityKey, desk, receiptHash, held)
      setDesk(result.desk)
      setActionError(result.overlayError ?? null)
      const items = await lookupCaptureItems(url).catch(() => null)
      if (items) applyItems(items)
    } catch (err) {
      console.error('Accept capture failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRefund = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    const at = nowIso()
    try {
      refundCapture(desk, at)
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('refund')
    try {
      const held = await loadEscrow(session)
      const result = await refundOnChain(session.wallet, url, session.identityKey, desk, at, held)
      setDesk(result.desk)
      setActionError(result.overlayError ?? null)
      const items = await lookupCaptureItems(url).catch(() => null)
      if (items) applyItems(items)
    } catch (err) {
      console.error('Refund capture failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (request) clearDesk(request.requestId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setPreview('')
    setFile(null)
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!request || !hintTxid || !request.requesterIdentity) return
    try {
      await navigator.clipboard.writeText(capturePublicUrl(request.requestId, request.requesterIdentity, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const combinedError = actionError || walletError
  const lines = request ? payoutLines(request.rewardSats, request.processingFeeSats) : draftSplit
  const openRequest = Boolean(request && !desk.accept && !desk.refund && !desk.pendingRefund && !desk.earlyRefund)

  return (
    <div className="table-scene">
      <div className={`scene-crop ${request ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt={SCENE_ALT}
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{TITLE}</h1>
            <p className="lede">{LEDE}</p>
          </header>

          <BusinessCase />
          <p className="receipt-note">{HASH_NOTE}</p>
          <p className="receipt-note">{SCRIPT_NOTE}</p>
          <p className="receipt-note">{DESK_NOTE}</p>

          {!request && (
            <section className="block" id="request-draft">
              <p className="job">{DRAFT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="place">{LOCATION_LABEL}</label>
                  <input id="place" value={location} maxLength={120} placeholder="12 Market Street storefront" onChange={(event) => setLocation(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="brief">{BRIEF_LABEL}</label>
                  <input id="brief" value={brief} maxLength={280} placeholder="Film the awning and the front window" onChange={(event) => setBrief(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="reward">{REWARD_LABEL}</label>
                    <input id="reward" inputMode="numeric" value={reward} onChange={(event) => setReward(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="processing">{PROCESSING_LABEL}</label>
                    <input id="processing" inputMode="numeric" value={processing} onChange={(event) => setProcessing(event.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="deadline">{DEADLINE_LABEL}</label>
                  <input id="deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                </div>
              </div>
              {draftSplit && (
                <dl className="fees">
                  <div><dt>{LINE_REWARD}</dt><dd>{formatAmount(draftSplit.rewardSats)}</dd></div>
                  <div><dt>{LINE_DESK}</dt><dd>{formatAmount(draftSplit.deskFeeSats)}</dd></div>
                  <div><dt>{LINE_PROCESSING}</dt><dd>{formatAmount(draftSplit.processingFeeSats)}</dd></div>
                  <div><dt>{LINE_CONTRIBUTOR}</dt><dd>{formatAmount(draftSplit.contributorSats)}</dd></div>
                </dl>
              )}
              <p className="job">{FUND_JOB}</p>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || connecting} onClick={() => void runFund()}>
                  {busy === 'fund' ? FUNDING_BUTTON : FUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {request && (
            <section className="block" id="capture-request">
              <div className="show-hero">
                <span className={`stamp ${desk.accept ? 'released' : desk.refund ? 'flagged' : ''}`}>
                  {desk.accept ? 'Accepted' : desk.refund ? 'Refunded' : desk.earlyRefund ? 'Early spend' : desk.pendingRefund ? 'Pending' : 'Open'}
                </span>
              </div>
              <h2>{request.location}</h2>
              <p className="job">{request.brief}</p>
              <p className="helper">Deadline {formatWhen(request.deadline)}</p>
              {lines && (
                <dl className="fees">
                  <div><dt>{LINE_REWARD}</dt><dd>{formatAmount(lines.rewardSats)}</dd></div>
                  <div><dt>{LINE_DESK}</dt><dd>{formatAmount(lines.deskFeeSats)}</dd></div>
                  <div><dt>{LINE_PROCESSING}</dt><dd>{formatAmount(lines.processingFeeSats)}</dd></div>
                  <div><dt>{LINE_CONTRIBUTOR}</dt><dd>{formatAmount(lines.contributorSats)}</dd></div>
                </dl>
              )}
              {hintTxid && request.requesterIdentity && (
                <p className="helper">
                  {STRANGER_LINE}{' '}
                  <button type="button" className="text-btn" onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy link'}</button>
                </p>
              )}
            </section>
          )}

          {openRequest && (
            <section className="slip" id="capture-submit">
              <p className="job">{SUBMIT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="capture-file">{FILE_LABEL}</label>
                  <input id="capture-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                </div>
                <div className="field">
                  <label htmlFor="geohash">{GEOHASH_LABEL}</label>
                  <input id="geohash" value={geohash} maxLength={5} placeholder="u4pru" onChange={(event) => setGeohash(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="preview">{PREVIEW_LABEL}</label>
                  <textarea id="preview" value={preview} maxLength={2000} placeholder="What the watermarked preview shows" onChange={(event) => setPreview(event.target.value)} />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || connecting} onClick={() => void runSubmit()}>
                  {busy === 'submit' ? SUBMITTING_BUTTON : SUBMIT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {openRequest && desk.pendingSubmissions.length > 0 && (
            <section className="slip" id="capture-pending">
              <p className="job">{PENDING_CAPTURE}</p>
              <ul className="receipts">
                {desk.pendingSubmissions.map((row) => (
                  <li key={`${row.contributorIdentity}-${row.receiptHash}`}>
                    <span>{row.geohash} · {formatWhen(row.capturedAt)} · <code>{row.receiptHash.slice(0, 12)}</code></span>
                    {row.hostAssertedAt && <span> · {HOST_ASSERTED_LABEL} {formatWhen(row.hostAssertedAt)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openRequest && desk.lateSubmissions.length > 0 && (
            <section className="slip" id="capture-late">
              <p className="job">{LATE_CAPTURE}</p>
            </section>
          )}

          {openRequest && desk.submissions.length > 0 && (
            <section className="slip" id="capture-accept">
              <p className="job">{ACCEPT_JOB}</p>
              <div className="fields">
                {desk.submissions.map((row) => (
                  <label key={`${row.contributorIdentity}-${row.receiptHash}`} className="check">
                    <input
                      type="radio"
                      name="receipt"
                      checked={receiptHash === row.receiptHash}
                      onChange={() => setReceiptHash(row.receiptHash)}
                    />
                    <span>{row.geohash} · {formatWhen(row.capturedAt)} · <code>{row.receiptHash.slice(0, 12)}</code></span>
                  </label>
                ))}
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || connecting || !receiptHash} onClick={() => void runAccept()}>
                  {busy === 'accept' ? ACCEPTING_BUTTON : ACCEPT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {openRequest && (
            <section className="slip" id="capture-refund">
              <p className="job">{REFUND_JOB}</p>
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null || connecting} onClick={() => void runRefund()}>
                  {busy === 'refund' ? REFUNDING_BUTTON : REFUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          <section className="slip" id="agent-402">
            <h2>{AGENT_402_TITLE}</h2>
            <p className="job">{AGENT_402_NOTE}</p>
            <pre>{AGENT_402_CURL}</pre>
          </section>

          <section className="slip" id="capture-board">
            <h2>{BOARD_HEADING}</h2>
            <p className="job">{BOARD_NOTE}</p>
            <dl className="meta">
              <div><dt>Open</dt><dd>{stats.open}</dd></div>
              <div><dt>Accepted</dt><dd>{stats.accepted}</dd></div>
              <div><dt>Refunded</dt><dd>{stats.refunded}</dd></div>
              <div><dt>Pending</dt><dd>{stats.pending}</dd></div>
              <div><dt>Accept rate</dt><dd>{formatRate(stats.acceptRate)}</dd></div>
              <div><dt>Median time to accept</dt><dd>{formatMedian(stats.medianAcceptMs)}</dd></div>
            </dl>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBoard}>{REFRESH_BUTTON}</button>
              {request && (
                <button type="button" className="btn" onClick={startOver}>Start another</button>
              )}
            </div>
            {boardError && <p className="helper">{boardError}</p>}
            {board.length === 0 && !boardError && <p className="helper">{BOARD_EMPTY}</p>}
            {board.length > 0 && (
              <ul className="receipts">
                {board.map((row) => (
                  <li key={row.requestId}>
                    <a
                      className="text-btn"
                      href={captureHref(row.requestId, row.request.requesterIdentity, row.txid)}
                      onClick={(event) => {
                        event.preventDefault()
                        openListed(row)
                      }}
                    >
                      {row.request.location}
                    </a>
                    <span> {formatAmount(row.request.rewardSats)} sats · {row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {desk.notice && <p className="status ok">{desk.notice}</p>}
          {combinedError && <p className="status err">{combinedError}</p>}
        </article>

        {showInstall && (
          <div className="install" ref={installRef}>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy !== null || connecting} onClick={() => void runFund()}>
                Retry
              </button>
              <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
                Install Desktop
              </a>
            </div>
          </div>
        )}
        {combinedError === CHROME_ALLOW_HINT && <p className="helper">{CHROME_ALLOW_HINT}</p>}

        <details className="advanced">
          <summary>How it works</summary>
          <p>{LOCAL_NOTE}</p>
          <p>{FEE_HELPER}</p>
        </details>

        <details className="advanced">
          <summary>Advanced</summary>
          <p>Amounts are in sats. The raw file is not uploaded.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {request && <p>Request id <code>{request.requestId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
        </details>

        <p className="fine-print">{FOOTER}</p>
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
