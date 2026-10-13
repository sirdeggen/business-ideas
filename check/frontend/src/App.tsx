import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CHECK_FEE_SATS,
  DEFAULT_FIRST_TIME_THRESHOLD_SATS,
  DEMO_FIRST_PAYEE,
  DEMO_FLAGGED_PAYMAIL,
  DEMO_LOOKALIKE_PAYEE,
  DEMO_PRIOR_PAYEE,
  DEMO_VENDOR_PRIOR,
  SEED_FLAGS,
  creditStop,
  reporterShareOf,
  runBatch,
  parseVendorCsv,
  runCheck,
  type CheckFlag,
  type CheckReceipt,
  type SubjectKind
} from '../../protocol/check'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanCheck, assertCanFile, parseWhole, priorList, recordFlag, recordReceipt } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  AMOUNT_LABEL,
  BATCH_BUTTON,
  BATCH_JOB,
  BATCH_QUOTE,
  BOOK_EMPTY,
  BOOK_HEADING,
  CANCEL_BUTTON,
  CHECK_BUTTON,
  CHECK_JOB,
  COVER_HREF,
  COVER_LINK_LABEL,
  COVER_NOTE,
  CSV_LABEL,
  DEMO_BADGE,
  DEMO_NOTE,
  EYEBROW,
  FEE_HELPER,
  FEE_LABEL,
  FILE_BUTTON,
  FLAG_JOB,
  FLAGS_HEADING,
  FOOTER,
  LEDE,
  LINE_FEE,
  LINE_SHARE,
  LOCAL_NOTE,
  PAYEE_LABEL,
  PRIORS_LABEL,
  RECEIPT_NOTE,
  RECORD_FLAG_BUTTON,
  RECORD_JOB,
  RECORD_RECEIPT_BUTTON,
  RECORDING_BUTTON,
  REF_LABEL,
  REFRESH_BUTTON,
  SHARE_LABEL,
  STRANGER_LINE,
  THRESHOLD_LABEL,
  TITLE,
  formatAmount,
  stampFor
} from './lib/copy'
import { flagsFromItems, lookupCheckItems, lookupReceipt, receiptsFromItems } from './lib/overlay'
import { loadReceipt, loadSaved, rememberFlag, rememberReceipt } from './lib/persist'
import { checkPublicUrl, goHome, goToCheck, readCheckFromLocation } from './lib/route'

type Busy = 'receipt' | 'flag' | null
type RecordKind = 'receipt' | 'flag'

const PRIOR_SEED = `${DEMO_PRIOR_PAYEE}\n${DEMO_VENDOR_PRIOR}`

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readCheckFromLocation(), [])
  const saved = useMemo(() => loadSaved(), [])

  const [priors, setPriors] = useState(PRIOR_SEED)
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('25000')
  const [payerRef, setPayerRef] = useState('PO-100')
  const [fee, setFee] = useState(String(DEFAULT_CHECK_FEE_SATS))
  const [sharePercent, setSharePercent] = useState('50')
  const [threshold, setThreshold] = useState(String(DEFAULT_FIRST_TIME_THRESHOLD_SATS))
  const [csvText, setCsvText] = useState('')
  const [localFlags, setLocalFlags] = useState<CheckFlag[]>(saved.flags)
  const [remoteFlags, setRemoteFlags] = useState<CheckFlag[]>([])
  const [remoteReceipts, setRemoteReceipts] = useState<Array<CheckReceipt & { txid: string | null }>>([])
  const [active, setActive] = useState<CheckReceipt | null>(null)
  const [batch, setBatch] = useState<CheckReceipt[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [reporterName, setReporterName] = useState('')
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('paymail')
  const [subject, setSubject] = useState('')
  const [severity, setSeverity] = useState<'warn' | 'block'>('warn')
  const [note, setNote] = useState('')
  const [stake, setStake] = useState('100')
  const [selectedFlag, setSelectedFlag] = useState<CheckFlag | null>(null)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [lastRecord, setLastRecord] = useState<RecordKind>('receipt')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const flags = useMemo(() => {
    const map = new Map<string, CheckFlag>()
    for (const flag of [...SEED_FLAGS, ...localFlags, ...remoteFlags]) map.set(flag.flagId, flag)
    return [...map.values()]
  }, [localFlags, remoteFlags])

  const showInstall = walletMissing || actionNeedsInstall

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    let cancel = false
    void lookupCheckItems(url)
      .then((items) => {
        if (cancel) return
        setRemoteFlags(flagsFromItems(items))
        setRemoteReceipts(receiptsFromItems(items))
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
    const located = readCheckFromLocation()
    if (!located.checkId) return
    const local = loadReceipt(located.checkId)
    if (local) {
      setActive(local)
      return
    }
    let cancel = false
    void lookupReceipt(url, located.checkId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote) return
        setActive(remote)
      })
      .catch(() => {
        if (!cancel) setActionError('This check wasn’t found.')
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

  const settings = () => {
    const checkFeeSats = parseWhole(fee)
    const percent = parseWhole(sharePercent)
    const firstTimeThresholdSats = parseWhole(threshold)
    return {
      priorPayees: priorList(priors),
      flags,
      checkFeeSats: checkFeeSats ?? -1,
      reporterShareBps: percent == null ? -1 : percent * 100,
      firstTimeThresholdSats: firstTimeThresholdSats ?? -1
    }
  }

  const runCheckPayee = (override?: { payee?: string, amount?: string, payerRef?: string }): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const nextPayee = override?.payee ?? payee
    const nextAmount = override?.amount ?? amount
    const nextRef = override?.payerRef ?? payerRef
    if (override?.payee) setPayee(override.payee)
    if (override?.amount) setAmount(override.amount)
    if (override?.payerRef) setPayerRef(override.payerRef)
    const amountSats = parseWhole(nextAmount)
    try {
      const ready = assertCanCheck({
        ...settings(),
        payee: nextPayee,
        amountSats: amountSats ?? -1,
        payerRef: nextRef
      })
      const receipt = runCheck(ready)
      setActive(receipt)
      rememberReceipt(receipt)
      goToCheck(receipt.checkId, hintTxid)
    } catch (err) {
      fail(err)
    }
  }

  const runBatchFile = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const parsed = parseVendorCsv(csvText)
    setBatchErrors(parsed.errors)
    if (parsed.rows.length === 0) {
      setActionError(parsed.errors[0] ?? 'The vendor file has no rows.')
      return
    }
    try {
      const ready = assertCanCheck({
        ...settings(),
        payee: parsed.rows[0]?.payee ?? '',
        amountSats: parsed.rows[0]?.amountSats ?? 0,
        payerRef: parsed.rows[0]?.payerRef ?? ''
      })
      const receipts = runBatch(parsed.rows, ready)
      setBatch(receipts)
      for (const receipt of receipts) rememberReceipt(receipt)
      const first = receipts[0]
      if (first) {
        setActive(first)
        goToCheck(first.checkId, hintTxid)
      }
    } catch (err) {
      fail(err)
    }
  }

  const runCancel = (receipt = active): void => {
    if (!receipt) return
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      const next = creditStop(receipt, flags)
      setActive(next)
      setBatch((rows) => rows.map((row) => row.checkId === next.checkId ? next : row))
      rememberReceipt(next)
    } catch (err) {
      fail(err)
    }
  }

  const runFileFlag = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const stakeSats = parseWhole(stake)
    try {
      const flag = assertCanFile({
        reporterName,
        subjectKind,
        subject,
        severity,
        note,
        stakeSats: stakeSats ?? 0
      })
      setLocalFlags((rows) => [flag, ...rows.filter((row) => row.flagId !== flag.flagId)])
      setSelectedFlag(flag)
      rememberFlag(flag)
    } catch (err) {
      fail(err)
    }
  }

  const runRecordReceipt = async (): Promise<void> => {
    setLastRecord('receipt')
    setActionError(null)
    setActionNeedsInstall(false)
    if (!active) {
      setActionError('Run a check first.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('receipt')
    try {
      const result = await recordReceipt(session.wallet, url, session.identityKey, active)
      setHintTxid(result.txid)
      goToCheck(active.checkId, result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupCheckItems(url).catch(() => null)
      if (items) {
        setRemoteFlags(flagsFromItems(items))
        setRemoteReceipts(receiptsFromItems(items))
      }
    } catch (err) {
      console.error('Record check receipt failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRecordFlag = async (): Promise<void> => {
    setLastRecord('flag')
    setActionError(null)
    setActionNeedsInstall(false)
    if (!selectedFlag) {
      setActionError('Add a flag first.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('flag')
    try {
      const result = await recordFlag(session.wallet, url, session.identityKey, selectedFlag)
      setHintTxid(result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupCheckItems(url).catch(() => null)
      if (items) setRemoteFlags(flagsFromItems(items))
    } catch (err) {
      console.error('Record check flag failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    setActive(null)
    setBatch([])
    setHintTxid('')
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!active) return
    try {
      await navigator.clipboard.writeText(checkPublicUrl(active.checkId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const refreshBook = (): void => {
    void lookupCheckItems(url)
      .then((items) => {
        setRemoteFlags(flagsFromItems(items))
        setRemoteReceipts(receiptsFromItems(items))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  const onCsvFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setCsvText(await file.text())
  }

  const loadSample = (): void => {
    setCsvText([
      'payee,amount,payerRef',
      `${DEMO_LOOKALIKE_PAYEE},25000,BATCH-1`,
      `${DEMO_VENDOR_PRIOR},25000,BATCH-2`,
      `${DEMO_FLAGGED_PAYMAIL},25000,BATCH-3`,
      `${DEMO_FIRST_PAYEE},150000,BATCH-4`
    ].join('\n'))
  }

  const combinedError = actionError || walletError
  const sharePreview = active ? reporterShareOf(active.checkFeeSats, active.reporterShareBps) : 0

  return (
    <div className="table-scene">
      <div className={`scene-crop ${active ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="An accounts payable clerk at a modern desk pauses a payment on a warning card with a warning icon."
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
          <p className="receipt-note">{RECEIPT_NOTE}</p>

          <section className="block">
            <p className="job">{CHECK_JOB}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="priors">{PRIORS_LABEL}</label>
                <textarea id="priors" value={priors} onChange={(event) => setPriors(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="payee">{PAYEE_LABEL}</label>
                <input id="payee" value={payee} maxLength={200} placeholder={DEMO_FLAGGED_PAYMAIL} onChange={(event) => setPayee(event.target.value)} />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="amount">{AMOUNT_LABEL}</label>
                  <input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="payer-ref">{REF_LABEL}</label>
                  <input id="payer-ref" value={payerRef} maxLength={80} onChange={(event) => setPayerRef(event.target.value)} />
                </div>
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="check-fee">{FEE_LABEL}</label>
                  <input id="check-fee" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="share">{SHARE_LABEL}</label>
                  <input id="share" inputMode="numeric" value={sharePercent} onChange={(event) => setSharePercent(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="threshold">{THRESHOLD_LABEL}</label>
                <input id="threshold" inputMode="numeric" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
              </div>
            </div>
            <p className="helper">{FEE_HELPER}</p>
            <p className="helper">{STRANGER_LINE}</p>
            <div className="actions">
              <button type="button" className="btn primary" disabled={busy !== null} onClick={() => runCheckPayee()}>
                {CHECK_BUTTON}
              </button>
              <button type="button" className="btn" onClick={() => runCheckPayee({ payee: DEMO_LOOKALIKE_PAYEE, amount: '25000', payerRef: 'DEMO-LOOK' })}>
                Try a flagged lookalike
              </button>
              <button type="button" className="btn" onClick={() => runCheckPayee({ payee: DEMO_VENDOR_PRIOR, amount: '25000', payerRef: 'DEMO-CLEAN' })}>
                Try a clean payee
              </button>
            </div>
          </section>

          <section className="slip">
            <p className="job">{BATCH_JOB}</p>
            <p className="helper" id="batch-quote">{BATCH_QUOTE}</p>
            <div className="field">
              <label htmlFor="vendor-csv">{CSV_LABEL}</label>
              <textarea id="vendor-csv" value={csvText} placeholder="payee,amount,payerRef" onChange={(event) => setCsvText(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="vendor-file">Upload CSV</label>
              <input id="vendor-file" type="file" accept=".csv,text/csv,text/plain" onChange={(event) => void onCsvFile(event.target.files?.[0])} />
            </div>
            <div className="actions">
              <button type="button" className="btn primary" disabled={busy !== null} onClick={runBatchFile}>
                {BATCH_BUTTON}
              </button>
              <button type="button" className="btn" onClick={loadSample}>Load a sample file</button>
            </div>
            {batchErrors.length > 0 && <p className="status err">{batchErrors.join(' ')}</p>}
            {batch.length > 0 && (
              <ul className="receipts" id="batch-results">
                {batch.map((row) => (
                  <li key={row.checkId}>
                    <button type="button" className="text-btn" onClick={() => { setActive(row); goToCheck(row.checkId, hintTxid) }}>
                      {stampFor(row.verdict)} · {row.payee}
                    </button>
                    <span> {row.reason} {LINE_FEE} {formatAmount(row.checkFeeSats)} sats.</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {active && (
            <section className="slip">
              <div className="show-hero">
                <span className={`stamp ${active.verdict === 'pass' ? 'released' : 'flagged'}`} id="verdict-flag">
                  {stampFor(active.verdict)}
                </span>
              </div>
              <p className={active.verdict === 'pass' ? 'status ok' : 'status err'}>{active.reason}</p>
              <dl className="fees" id="fee-lines">
                <div>
                  <dt>{LINE_FEE}</dt>
                  <dd>{formatAmount(active.checkFeeSats)} sats</dd>
                </div>
                {active.citedFlagIds.length > 0 && (
                  <div>
                    <dt>{LINE_SHARE}</dt>
                    <dd>
                      {formatAmount(active.stopped ? active.reporterShareSats : sharePreview)} sats
                      {active.stopped ? '' : ' if you cancel'}
                      {active.reporterName ? ` · ${active.reporterName}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="helper">Receipt <code>{active.receiptHash}</code></p>
              <p className="helper">{COVER_NOTE} <a href={COVER_HREF}>{COVER_LINK_LABEL}</a></p>
              <div className="actions">
                {active.citedFlagIds.length > 0 && !active.stopped && (
                  <button type="button" className="btn danger" disabled={busy !== null} onClick={() => runCancel(active)}>
                    {CANCEL_BUTTON}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" onClick={startOver}>Start over</button>
              </div>
            </section>
          )}

          <section className="slip">
            <p className="job">{RECORD_JOB}</p>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || !active}
                onClick={() => void runRecordReceipt()}
              >
                {busy === 'receipt' ? RECORDING_BUTTON : RECORD_RECEIPT_BUTTON}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || connecting || !selectedFlag}
                onClick={() => void runRecordFlag()}
              >
                {busy === 'flag' ? RECORDING_BUTTON : RECORD_FLAG_BUTTON}
              </button>
            </div>
          </section>

          <section className="slip">
            <p className="job">{FLAG_JOB}</p>
            <div className="fields">
              <div className="grid">
                <div className="field">
                  <label htmlFor="reporter">Reporter</label>
                  <input id="reporter" value={reporterName} maxLength={80} onChange={(event) => setReporterName(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="subject-kind">Subject</label>
                  <select id="subject-kind" value={subjectKind} onChange={(event) => setSubjectKind(event.target.value as SubjectKind)}>
                    <option value="key">Identity key</option>
                    <option value="paymail">Paymail</option>
                    <option value="script">Script hash</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="subject">Key, paymail, or script</label>
                <input id="subject" value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="severity">Severity</label>
                  <select id="severity" value={severity} onChange={(event) => setSeverity(event.target.value as 'warn' | 'block')}>
                    <option value="warn">Warn</option>
                    <option value="block">Block</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="stake">Stake (sats, simulated until recorded)</label>
                  <input id="stake" inputMode="numeric" value={stake} onChange={(event) => setStake(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="note">Note</label>
                <input id="note" value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn" disabled={busy !== null} onClick={runFileFlag}>
                {FILE_BUTTON}
              </button>
            </div>
          </section>

          <section className="slip" id="public-book">
            <h2>{FLAGS_HEADING}</h2>
            <p className="helper">{DEMO_NOTE}</p>
            <ul className="receipts">
              {flags.map((flag) => (
                <li key={flag.flagId}>
                  <button type="button" className="text-btn" onClick={() => setSelectedFlag(flag)}>
                    {flag.severity === 'block' ? 'Block' : 'Warn'} · {flag.subject}
                  </button>
                  <span> {flag.reporterName}. {flag.note}</span>
                  {flag.demo && <span className="stamp flagged"> {DEMO_BADGE}</span>}
                </li>
              ))}
            </ul>
            <h2>{BOOK_HEADING}</h2>
            <p className="job">Flags and verdict receipts from the public book.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {remoteReceipts.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {remoteReceipts.length > 0 && (
              <ul className="receipts">
                {remoteReceipts.map((row) => (
                  <li key={row.checkId}>
                    <button type="button" className="text-btn" onClick={() => { setActive(row); goToCheck(row.checkId, row.txid) }}>
                      {stampFor(row.verdict)} · {row.payee}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {combinedError && <p className="status err">{combinedError}</p>}
        </article>

        {showInstall && (
          <div className="install" ref={installRef}>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting}
                onClick={() => void (lastRecord === 'flag' ? runRecordFlag() : runRecordReceipt())}
              >
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
          <p>Recording uses a BSV Desktop wallet. The receipt output is the check fee. A recorded flag output is the stake. Slashing is not a script in v0.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {active && <p>Check id <code>{active.checkId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          {active && <p>Receipt hash <code>{active.receiptHash}</code></p>}
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
