import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TIERS,
  appendStage,
  emptyDesk,
  exportTimeline,
  fundPool,
  nextStage,
  releaseLines,
  releaseTier,
  submitReport,
  type DeskState,
  type Tier
} from '../../protocol/bounty'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanRecord, parseWhole, recordBounty } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  ACK_BUTTON,
  BOOK_EMPTY,
  BOOK_HEADING,
  COPY_REPORT_BUTTON,
  DESK_NOTE,
  DISCLOSED_BUTTON,
  EXPORT_BUTTON,
  EXPORT_FEE_LABEL,
  EXPORT_JOB,
  EXPORT_NOTE,
  EYEBROW,
  FEE_HELPER,
  FIXED_BUTTON,
  FOOTER,
  FUND_BUTTON,
  FUND_JOB,
  HASH_NOTE,
  LEDE,
  LINE_FEE,
  LINE_LEFT,
  LINE_LOCK,
  LINE_POOL,
  LINE_RESEARCHER,
  LINE_SUBMISSION,
  LINE_TIER,
  LOCAL_NOTE,
  PAYOUT_BPS_LABEL,
  PROJECT_LABEL,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  REFRESH_BUTTON,
  RELEASE_BUTTON,
  RELEASE_JOB,
  REPORT_LABEL,
  RESEARCHER_LABEL,
  SCOPE_LABEL,
  SCRIPT_NOTE,
  STRANGER_LINE,
  SUBMIT_BUTTON,
  SUBMIT_JOB,
  SUBMISSION_FEE_LABEL,
  TIMELINE_JOB,
  TIER_LABEL,
  TITLE,
  formatAmount,
  formatWhen,
  tierLabel
} from './lib/copy'
import { bookFromItems, lookupBounty, lookupBountyItems, type ListedBounty } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { bountyPublicUrl, goHome, goToBounty, readBountyFromLocation } from './lib/route'

type Busy = 'record' | null

function stageButton(stage: string | null): string | null {
  if (stage === 'acknowledged') return ACK_BUTTON
  if (stage === 'fixed') return FIXED_BUTTON
  if (stage === 'disclosed') return DISCLOSED_BUTTON
  return null
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readBountyFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [projectName, setProjectName] = useState('')
  const [scope, setScope] = useState('')
  const [critical, setCritical] = useState('500000')
  const [high, setHigh] = useState('200000')
  const [medium, setMedium] = useState('80000')
  const [low, setLow] = useState('20000')
  const [payoutBps, setPayoutBps] = useState('800')
  const [submissionFee, setSubmissionFee] = useState('1000')
  const [exportFee, setExportFee] = useState('2500')
  const [researcher, setResearcher] = useState('')
  const [reportBody, setReportBody] = useState('')
  const [tier, setTier] = useState<Tier>('high')
  const [researcherKey, setResearcherKey] = useState('')
  const [book, setBook] = useState<ListedBounty[]>([])
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportCopied, setReportCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const fund = desk.fund
  const upcoming = nextStage(desk.timeline)
  const upcomingLabel = stageButton(upcoming)

  const preview = useMemo(() => {
    if (!fund || !desk.submission || desk.verdict) return null
    const amount = fund.tiers[tier]
    if (amount < 1) return null
    try {
      return releaseLines(fund.poolSats, amount, fund.payoutFeeBps)
    } catch {
      return null
    }
  }, [fund, desk.submission, desk.verdict, tier])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!fund || readonly) return
    saveDesk(fund.bountyId, desk)
  }, [desk, fund, readonly])

  useEffect(() => {
    let cancel = false
    void lookupBountyItems(url)
      .then((items) => {
        if (cancel) return
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => {
        if (!cancel) setBookError('The public book didn’t load.')
      })
    return () => {
      cancel = true
    }
  }, [url])

  useEffect(() => {
    const located = readBountyFromLocation()
    if (!located.bountyId) return
    const local = loadDesk(located.bountyId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupBounty(url, located.bountyId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote?.fund) return
        setDesk(remote)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This pool wasn’t found.')
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

  const runFund = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      const next = fundPool({
        projectName,
        scope,
        tiers: {
          critical: parseWhole(critical) ?? -1,
          high: parseWhole(high) ?? -1,
          medium: parseWhole(medium) ?? -1,
          low: parseWhole(low) ?? -1
        },
        payoutFeeBps: parseWhole(payoutBps) ?? -1,
        submissionFeeSats: parseWhole(submissionFee) ?? -1,
        exportFeeSats: parseWhole(exportFee) ?? -1
      })
      setDesk(next)
      setReadonly(false)
      if (next.fund) goToBounty(next.fund.bountyId)
    } catch (err) {
      fail(err)
    }
  }

  const runSubmit = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      setDesk(submitReport(desk, { researcherName: researcher, reportBody }))
    } catch (err) {
      fail(err)
    }
  }

  const runVerdict = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      setDesk(releaseTier(desk, tier))
    } catch (err) {
      fail(err)
    }
  }

  const runTimeline = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    if (!upcoming || upcoming === 'received') return
    try {
      setDesk(appendStage(desk, upcoming))
    } catch (err) {
      fail(err)
    }
  }

  const runExport = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      setDesk(exportTimeline(desk))
    } catch (err) {
      fail(err)
    }
  }

  const runRecord = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      assertCanRecord(desk, researcherKey)
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('record')
    try {
      const result = await recordBounty(session.wallet, url, session.identityKey, desk, researcherKey, reportBody)
      setHintTxid(result.txid)
      if (desk.fund) goToBounty(desk.fund.bountyId, result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupBountyItems(url).catch(() => null)
      if (items) setBook(bookFromItems(items))
    } catch (err) {
      console.error('Record bounty failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (fund) clearDesk(fund.bountyId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setReportBody('')
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!fund) return
    try {
      await navigator.clipboard.writeText(bountyPublicUrl(fund.bountyId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const copyReport = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(reportBody)
      setReportCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const openListed = (row: ListedBounty): void => {
    const local = loadDesk(row.bountyId)
    if (local) {
      setDesk(local)
      setReadonly(false)
    } else {
      setDesk({
        fund: row.fund,
        submission: row.submission,
        verdict: row.verdict,
        timeline: [],
        exportText: null,
        rejection: null,
        notice: null
      })
      setReadonly(true)
    }
    setHintTxid(row.txid ?? '')
    goToBounty(row.bountyId, row.txid)
  }

  const refreshBook = (): void => {
    void lookupBountyItems(url)
      .then((items) => {
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  const combinedError = actionError || walletError
  const lines = desk.verdict
    ? {
      tierSats: desk.verdict.tierSats,
      feeSats: desk.verdict.feeSats,
      researcherSats: desk.verdict.researcherSats,
      poolLeft: desk.verdict.poolLeft,
      projectLockSats: desk.verdict.poolLeft + desk.verdict.feeSats
    }
    : preview

  return (
    <div className="table-scene">
      <div className={`scene-crop ${fund ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A researcher at a bright desk with a sealed envelope and a sky-blue seal, beside a board of four severity tiers."
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

          {!fund && (
            <section className="block">
              <p className="job">{FUND_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="project">{PROJECT_LABEL}</label>
                  <input id="project" value={projectName} maxLength={80} placeholder="Northwind Devices" onChange={(event) => setProjectName(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="scope">{SCOPE_LABEL}</label>
                  <input id="scope" value={scope} maxLength={280} placeholder="Public API and the firmware updater" onChange={(event) => setScope(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="tier-critical">Critical (sats)</label>
                    <input id="tier-critical" inputMode="numeric" value={critical} onChange={(event) => setCritical(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="tier-high">High (sats)</label>
                    <input id="tier-high" inputMode="numeric" value={high} onChange={(event) => setHigh(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="tier-medium">Medium (sats)</label>
                    <input id="tier-medium" inputMode="numeric" value={medium} onChange={(event) => setMedium(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="tier-low">Low (sats)</label>
                    <input id="tier-low" inputMode="numeric" value={low} onChange={(event) => setLow(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="payout-bps">{PAYOUT_BPS_LABEL}</label>
                    <input id="payout-bps" inputMode="numeric" value={payoutBps} onChange={(event) => setPayoutBps(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="submission-fee">{SUBMISSION_FEE_LABEL}</label>
                    <input id="submission-fee" inputMode="numeric" value={submissionFee} onChange={(event) => setSubmissionFee(event.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="export-fee">{EXPORT_FEE_LABEL}</label>
                  <input id="export-fee" inputMode="numeric" value={exportFee} onChange={(event) => setExportFee(event.target.value)} />
                </div>
              </div>
              <p className="helper">{FEE_HELPER}</p>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runFund}>
                  {FUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {fund && (
            <section className="block">
              <h2>{fund.projectName}</h2>
              <p className="job">{fund.scope}</p>
              <dl className="fees">
                <div>
                  <dt>{LINE_POOL}</dt>
                  <dd>{formatAmount(fund.poolSats)}</dd>
                </div>
                {TIERS.map((name) => (
                  <div key={name}>
                    <dt>{tierLabel(name)}</dt>
                    <dd>{formatAmount(fund.tiers[name])}</dd>
                  </div>
                ))}
                <div>
                  <dt>{LINE_SUBMISSION}</dt>
                  <dd>{formatAmount(fund.submissionFeeSats)}</dd>
                </div>
              </dl>
              <p className="helper" id="script-note">{SCRIPT_NOTE}</p>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {!readonly && <button type="button" className="btn" onClick={startOver}>Start over</button>}
              </div>
            </section>
          )}

          {fund && !desk.submission && !readonly && (
            <section className="slip">
              <p className="job">{SUBMIT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="researcher">{RESEARCHER_LABEL}</label>
                  <input id="researcher" value={researcher} maxLength={80} placeholder="Ada" onChange={(event) => setResearcher(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="report">{REPORT_LABEL}</label>
                  <textarea id="report" rows={5} value={reportBody} maxLength={8000} placeholder="Describe the bug. This text stays off the chain." onChange={(event) => setReportBody(event.target.value)} />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runSubmit}>
                  {SUBMIT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {desk.submission && (
            <section className="slip">
              <p className="fine">Report hash</p>
              <p id="report-hash"><code>{desk.submission.reportHash}</code></p>
              <p className="helper">
                {desk.submission.researcherName} · {formatWhen(desk.submission.submittedAt)} · submission fee {formatAmount(desk.submission.submissionFeeSats)} sats
              </p>
              {reportBody.trim() && !readonly && (
                <div className="actions">
                  <button type="button" className="btn" onClick={() => void copyReport()}>
                    {reportCopied ? 'Copied' : COPY_REPORT_BUTTON}
                  </button>
                </div>
              )}
            </section>
          )}

          {fund && desk.submission && !readonly && (
            <section className="slip">
              <p className="job">{RELEASE_JOB}</p>
              {!desk.verdict && (
                <div className="field">
                  <label htmlFor="tier">{TIER_LABEL}</label>
                  <select id="tier" value={tier} onChange={(event) => setTier(event.target.value as Tier)}>
                    {TIERS.filter((name) => fund.tiers[name] > 0).map((name) => (
                      <option key={name} value={name}>{tierLabel(name)} · {formatAmount(fund.tiers[name])}</option>
                    ))}
                  </select>
                </div>
              )}
              {lines && (
                <dl className="fees" id="tier-release">
                  <div>
                    <dt>{LINE_TIER}</dt>
                    <dd>{formatAmount(lines.tierSats)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_FEE}</dt>
                    <dd>{formatAmount(lines.feeSats)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_RESEARCHER}</dt>
                    <dd>{formatAmount(lines.researcherSats)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_LEFT}</dt>
                    <dd>{formatAmount(lines.poolLeft)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_LOCK}</dt>
                    <dd>{formatAmount(lines.projectLockSats)}</dd>
                  </div>
                </dl>
              )}
              {!desk.verdict && (
                <div className="actions">
                  <button type="button" className="btn primary" disabled={busy !== null} onClick={runVerdict}>
                    {RELEASE_BUTTON}
                  </button>
                </div>
              )}
              {desk.verdict && <p className="status ok">Released {tierLabel(desk.verdict.tier)} at {formatWhen(desk.verdict.releasedAt)}.</p>}
            </section>
          )}

          {desk.submission && (
            <section className="slip" id="timeline">
              <p className="job">{TIMELINE_JOB}</p>
              <p className="helper" id="desk-note">{DESK_NOTE}</p>
              <ol className="receipts">
                {desk.timeline.map((event) => (
                  <li key={event.stage}>{tierLabel(event.stage)} · {formatWhen(event.at)}</li>
                ))}
              </ol>
              {upcomingLabel && !readonly && (
                <div className="actions">
                  <button type="button" className="btn primary" disabled={busy !== null} onClick={runTimeline}>
                    {upcomingLabel}
                  </button>
                </div>
              )}
            </section>
          )}

          {desk.submission && !readonly && (
            <section className="slip">
              <p className="job">{EXPORT_JOB}</p>
              <p className="helper" id="export-note">{EXPORT_NOTE}</p>
              {fund && <p className="helper">Export fee {formatAmount(fund.exportFeeSats)} sats.</p>}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runExport}>
                  {EXPORT_BUTTON}
                </button>
              </div>
              {desk.exportText && <pre id="export-record">{desk.exportText}</pre>}
            </section>
          )}

          {fund && !readonly && (
            <section className="slip">
              <p className="job">{RECORD_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting}
                  onClick={() => void runRecord()}
                >
                  {busy === 'record' ? RECORDING_BUTTON : RECORD_BUTTON}
                </button>
              </div>
            </section>
          )}

          <section className="slip" id="public-book">
            <h2>{BOOK_HEADING}</h2>
            <p className="job">Pools, report hashes, and verdicts from the public book.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {book.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {book.length > 0 && (
              <ul className="receipts">
                {book.map((row) => (
                  <li key={row.bountyId}>
                    <button type="button" className="text-btn" onClick={() => openListed(row)}>
                      {row.fund.projectName}
                    </button>
                    <span> {formatAmount(row.fund.poolSats)} sats{row.verdict ? ` · ${row.verdict.tier} released` : ''}</span>
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
              <button type="button" className="btn primary" disabled={busy !== null || connecting} onClick={() => void runRecord()}>
                Retry
              </button>
              <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
                Install BSV Desktop
              </a>
            </div>
          </div>
        )}
        {combinedError === CHROME_ALLOW_HINT && <p className="helper">{CHROME_ALLOW_HINT}</p>}

        <details className="advanced">
          <summary>Advanced</summary>
          <p>Amounts are in sats.</p>
          <p>{LOCAL_NOTE}</p>
          <p>{FEE_HELPER}</p>
          <p>Recording uses a BSV Desktop wallet. The report body, when you still have it in this tab, goes out over Message Box and not in the transaction.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {fund && <p>Bounty id <code>{fund.bountyId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          <label htmlFor="researcher-key">Researcher key</label>
          <input id="researcher-key" value={researcherKey} onChange={(event) => setResearcherKey(event.target.value)} placeholder="Compressed public key" />
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
