import { useEffect, useMemo, useRef, useState } from 'react'
import {
  REDEEM_BALANCE,
  attestReserve,
  collateralOf,
  coverageBlock,
  emptyDesk,
  holderUnits,
  issueBrand,
  liabilityOf,
  mintFeeLines,
  mintUnits,
  outstandingUnits,
  redeemFeeLines,
  redeemUnits,
  type CollateralFlag,
  type DeskState
} from '../../protocol/scrip'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanIssue, parseWhole, recordScrip } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  ATTEST_BUTTON,
  ATTEST_JOB,
  BOOK_EMPTY,
  BOOK_HEADING,
  BRAND_LABEL,
  EYEBROW,
  FEE_HELPER,
  FOOTER,
  HOLDER_LABEL,
  ISSUE_BUTTON,
  ISSUE_JOB,
  LEDE,
  LINE_FEE,
  LINE_GROSS,
  LINE_LIABILITY,
  LINE_NET,
  LINE_PAID,
  LINE_RESERVE,
  LINE_SETUP,
  LOCAL_NOTE,
  MINT_BPS_LABEL,
  MINT_BUTTON,
  MINT_JOB,
  ORG_LABEL,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  REDEEM_BPS_LABEL,
  REDEEM_BUTTON,
  REDEEM_JOB,
  REFRESH_BUTTON,
  RESERVE_LABEL,
  SETUP_LABEL,
  STAMP_COVERED,
  STAMP_MISSING,
  STAMP_OVER,
  STAMP_UNDER,
  STRANGER_LINE,
  TICKER_LABEL,
  TITLE,
  UNIT_LABEL,
  UNIT_RATE_LABEL,
  UNITS_LABEL,
  YIELD_SHARE_LINE,
  coverageLine,
  formatAmount,
  formatWhen
} from './lib/copy'
import { bookFromItems, lookupScrip, lookupScripItems, type ListedBrand } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { goHome, goToScrip, readScripFromLocation, scripPublicUrl } from './lib/route'

type Busy = 'record' | null

function stampFor(flag: CollateralFlag): string {
  if (flag === 'under') return STAMP_UNDER
  if (flag === 'covered') return STAMP_COVERED
  if (flag === 'over') return STAMP_OVER
  return STAMP_MISSING
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readScripFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [orgName, setOrgName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [ticker, setTicker] = useState('')
  const [unitLabel, setUnitLabel] = useState('')
  const [setupFee, setSetupFee] = useState('5000')
  const [mintBps, setMintBps] = useState('50')
  const [redeemBps, setRedeemBps] = useState('25')
  const [satsPerUnit, setSatsPerUnit] = useState('1')
  const [holder, setHolder] = useState('')
  const [units, setUnits] = useState('')
  const [reserve, setReserve] = useState('')
  const [redeemHolder, setRedeemHolder] = useState('')
  const [redeemAmount, setRedeemAmount] = useState('')
  const [book, setBook] = useState<ListedBrand[]>([])
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const issue = desk.issue
  const coverage = collateralOf(desk)
  const liability = issue ? liabilityOf(desk) : 0
  const outstanding = outstandingUnits(desk)

  const mintPreview = useMemo(() => {
    if (!issue) return null
    const amount = parseWhole(units)
    if (amount == null) return null
    return mintFeeLines(amount, issue.satsPerUnit, issue.mintFeeBps)
  }, [issue, units])

  const redeemPreview = useMemo(() => {
    if (!issue) return null
    const amount = parseWhole(redeemAmount)
    if (amount == null) return null
    return redeemFeeLines(amount, issue.satsPerUnit, issue.redeemFeeBps)
  }, [issue, redeemAmount])

  const globalBlock = issue ? coverageBlock(desk) : null
  const redeemCount = parseWhole(redeemAmount)
  const holderBlock = issue && !globalBlock && redeemHolder.trim() && redeemCount != null && redeemCount >= 1
    && holderUnits(desk, redeemHolder) < redeemCount
    ? REDEEM_BALANCE
    : null
  const redeemBlock = globalBlock ?? holderBlock

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!issue || readonly) return
    saveDesk(issue.scripId, desk)
  }, [desk, issue, readonly])

  useEffect(() => {
    let cancel = false
    void lookupScripItems(url)
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
    const located = readScripFromLocation()
    if (!located.scripId) return
    const local = loadDesk(located.scripId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupScrip(url, located.scripId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote?.issue) return
        setDesk(remote)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This brand wasn’t found.')
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

  const runIssue = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const setupFeeSats = parseWhole(setupFee)
    const mintFeeBps = parseWhole(mintBps)
    const redeemFeeBps = parseWhole(redeemBps)
    const perUnit = parseWhole(satsPerUnit)
    try {
      const ready = assertCanIssue({
        orgName,
        brandName,
        ticker,
        unitLabel,
        setupFeeSats: setupFeeSats ?? -1,
        mintFeeBps: mintFeeBps ?? -1,
        redeemFeeBps: redeemFeeBps ?? -1,
        satsPerUnit: perUnit ?? 0
      })
      const next = issueBrand(ready)
      setDesk(next)
      setReadonly(false)
      if (next.issue) goToScrip(next.issue.scripId)
    } catch (err) {
      fail(err)
    }
  }

  const runMint = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const amount = parseWhole(units)
    try {
      setDesk(mintUnits(desk, holder, amount ?? 0))
      setUnits('')
    } catch (err) {
      fail(err)
    }
  }

  const runAttest = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const reserveSats = parseWhole(reserve)
    try {
      setDesk(attestReserve(desk, reserveSats ?? -1))
    } catch (err) {
      fail(err)
    }
  }

  const runRedeem = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const amount = parseWhole(redeemAmount)
    try {
      setDesk(redeemUnits(desk, redeemHolder, amount ?? 0))
    } catch (err) {
      fail(err)
    }
  }

  const runRecord = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    const session = await ensureWallet()
    if (!session) return
    setBusy('record')
    try {
      const result = await recordScrip(session.wallet, url, session.identityKey, desk)
      setHintTxid(result.txid)
      if (desk.issue) goToScrip(desk.issue.scripId, result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupScripItems(url).catch(() => null)
      if (items) setBook(bookFromItems(items))
    } catch (err) {
      console.error('Record scrip failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (issue) clearDesk(issue.scripId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!issue) return
    try {
      await navigator.clipboard.writeText(scripPublicUrl(issue.scripId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const openListed = (row: ListedBrand): void => {
    const local = loadDesk(row.scripId)
    if (local) {
      setDesk(local)
      setReadonly(false)
    } else {
      setDesk({
        issue: row.issue,
        mints: row.mints,
        redeems: row.redeems,
        attestations: row.attestations,
        rejection: null,
        notice: null
      })
      setReadonly(true)
    }
    setHintTxid(row.txid ?? '')
    goToScrip(row.scripId, row.txid)
  }

  const refreshBook = (): void => {
    void lookupScripItems(url)
      .then((items) => {
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  const combinedError = actionError || walletError
  const latest = coverage.attestation

  return (
    <div className="table-scene">
      <div className={`scene-crop ${issue ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A festival campus cash booth with a glass counter and an emerald seal."
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
          <p className="helper">{YIELD_SHARE_LINE}</p>

          {!issue && (
            <section className="block">
              <p className="job">{ISSUE_JOB}</p>
              <div className="fields">
                <div className="grid">
                  <div className="field">
                    <label htmlFor="org">{ORG_LABEL}</label>
                    <input id="org" value={orgName} maxLength={80} placeholder="North Campus Union" onChange={(event) => setOrgName(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="brand">{BRAND_LABEL}</label>
                    <input id="brand" value={brandName} maxLength={80} placeholder="Campus Cash" onChange={(event) => setBrandName(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="ticker">{TICKER_LABEL}</label>
                    <input id="ticker" value={ticker} maxLength={12} placeholder="CAMP" onChange={(event) => setTicker(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="unit">{UNIT_LABEL}</label>
                    <input id="unit" value={unitLabel} maxLength={40} placeholder="Campus Cash" onChange={(event) => setUnitLabel(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="setup-fee">{SETUP_LABEL}</label>
                    <input id="setup-fee" inputMode="numeric" value={setupFee} onChange={(event) => setSetupFee(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="sats-per-unit">{UNIT_RATE_LABEL}</label>
                    <input id="sats-per-unit" inputMode="numeric" value={satsPerUnit} onChange={(event) => setSatsPerUnit(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="mint-bps">{MINT_BPS_LABEL}</label>
                    <input id="mint-bps" inputMode="numeric" value={mintBps} onChange={(event) => setMintBps(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="redeem-bps">{REDEEM_BPS_LABEL}</label>
                    <input id="redeem-bps" inputMode="numeric" value={redeemBps} onChange={(event) => setRedeemBps(event.target.value)} />
                  </div>
                </div>
              </div>
              <p className="helper">{FEE_HELPER}</p>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runIssue}>
                  {ISSUE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {issue && (
            <section className="block">
              <div className="show-hero">
                <span className={`stamp ${coverage.flag === 'under' || coverage.flag === 'missing' ? 'flagged' : 'released'}`} id="coverage-flag">
                  {stampFor(coverage.flag)}
                </span>
              </div>
              <h2>{issue.brandName}</h2>
              <p className="job">{issue.orgName} · {issue.ticker} · {issue.unitLabel}</p>
              <p className={coverage.flag === 'under' || coverage.flag === 'missing' ? 'status err' : 'status ok'}>
                {coverageLine(coverage.flag, coverage.reserveSats, liability)}
              </p>
              <dl className="fees">
                <div>
                  <dt>{LINE_SETUP}</dt>
                  <dd>{formatAmount(issue.setupFeeSats)}</dd>
                </div>
                <div>
                  <dt>{MINT_BPS_LABEL}</dt>
                  <dd>{issue.mintFeeBps}</dd>
                </div>
                <div>
                  <dt>{REDEEM_BPS_LABEL}</dt>
                  <dd>{issue.redeemFeeBps}</dd>
                </div>
                <div>
                  <dt>{LINE_LIABILITY}</dt>
                  <dd>{formatAmount(liability)} <span className="quiet">({formatAmount(outstanding)} {issue.unitLabel})</span></dd>
                </div>
                <div>
                  <dt>{LINE_RESERVE}</dt>
                  <dd>{coverage.reserveSats == null ? '—' : formatAmount(coverage.reserveSats)}</dd>
                </div>
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" onClick={startOver}>Start over</button>
              </div>
            </section>
          )}

          {issue && !readonly && (
            <section className="slip">
              <p className="job">{MINT_JOB}</p>
              <div className="grid">
                <div className="field">
                  <label htmlFor="holder">{HOLDER_LABEL}</label>
                  <input id="holder" value={holder} maxLength={40} onChange={(event) => setHolder(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="units">{UNITS_LABEL}</label>
                  <input id="units" inputMode="numeric" value={units} onChange={(event) => setUnits(event.target.value)} />
                </div>
              </div>
              {mintPreview && (
                <dl className="fees">
                  <div>
                    <dt>{LINE_PAID}</dt>
                    <dd>{formatAmount(mintPreview.satsPaid)}</dd>
                  </div>
                  <div>
                    <dt>{MINT_BPS_LABEL}</dt>
                    <dd>{mintPreview.feeBps}</dd>
                  </div>
                  <div>
                    <dt>{LINE_FEE}</dt>
                    <dd>{formatAmount(mintPreview.feeSats)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_NET}</dt>
                    <dd>{formatAmount(mintPreview.netSats)}</dd>
                  </div>
                </dl>
              )}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runMint}>
                  {MINT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {issue && !readonly && (
            <section className="slip">
              <p className="job">{ATTEST_JOB}</p>
              <div className="field">
                <label htmlFor="reserve">{RESERVE_LABEL}</label>
                <input id="reserve" inputMode="numeric" value={reserve} onChange={(event) => setReserve(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runAttest}>
                  {ATTEST_BUTTON}
                </button>
              </div>
              {latest && (
                <p className="helper">Latest attestation {formatWhen(latest.attestedAt)}. Reserve {formatAmount(latest.reserveSats)}.</p>
              )}
            </section>
          )}

          {issue && !readonly && (
            <section className="slip">
              <p className="job">{REDEEM_JOB}</p>
              {redeemBlock && <p className="status err" role="alert" id="redeem-block">{redeemBlock}</p>}
              <div className="grid">
                <div className="field">
                  <label htmlFor="redeem-holder">{HOLDER_LABEL}</label>
                  <input id="redeem-holder" value={redeemHolder} maxLength={40} onChange={(event) => setRedeemHolder(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="redeem-units">{UNITS_LABEL}</label>
                  <input id="redeem-units" inputMode="numeric" value={redeemAmount} onChange={(event) => setRedeemAmount(event.target.value)} />
                </div>
              </div>
              {redeemPreview && !redeemBlock && (
                <dl className="fees">
                  <div>
                    <dt>{LINE_GROSS}</dt>
                    <dd>{formatAmount(redeemPreview.grossSats)}</dd>
                  </div>
                  <div>
                    <dt>{REDEEM_BPS_LABEL}</dt>
                    <dd>{redeemPreview.feeBps}</dd>
                  </div>
                  <div>
                    <dt>{LINE_FEE}</dt>
                    <dd>{formatAmount(redeemPreview.feeSats)}</dd>
                  </div>
                  <div>
                    <dt>{LINE_NET}</dt>
                    <dd>{formatAmount(redeemPreview.netSats)}</dd>
                  </div>
                </dl>
              )}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || Boolean(redeemBlock)} onClick={runRedeem}>
                  {REDEEM_BUTTON}
                </button>
              </div>
            </section>
          )}

          {issue && (desk.mints.length > 0 || desk.redeems.length > 0 || desk.attestations.length > 0) && (
            <section className="slip">
              <p className="fine">Receipts</p>
              <ul className="receipts">
                {desk.mints.map((mint) => (
                  <li key={`mint-${mint.mintedAt}-${mint.holderName}-${mint.units}`}>
                    Mint {formatAmount(mint.units)} to {mint.holderName}. Fee {formatAmount(mint.feeSats)}. Net {formatAmount(mint.netSats)}.
                  </li>
                ))}
                {desk.attestations.map((row) => (
                  <li key={`attest-${row.attestedAt}`}>
                    Attestation {formatWhen(row.attestedAt)}. Reserve {formatAmount(row.reserveSats)}.
                  </li>
                ))}
                {desk.redeems.map((row) => (
                  <li key={`redeem-${row.redeemedAt}-${row.holderName}-${row.units}`}>
                    Redeem {formatAmount(row.units)} from {row.holderName}. Fee {formatAmount(row.feeSats)}. Net {formatAmount(row.netSats)}.
                  </li>
                ))}
              </ul>
            </section>
          )}

          {issue && !readonly && (
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
            <p className="job">Brands, attestations, and mint and redeem receipts from the public book.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {book.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {book.length > 0 && (
              <ul className="receipts">
                {book.map((row) => {
                  const view = collateralOf({
                    issue: row.issue,
                    mints: row.mints,
                    redeems: row.redeems,
                    attestations: row.attestations,
                    rejection: null,
                    notice: null
                  })
                  return (
                    <li key={row.scripId}>
                      <button type="button" className="text-btn" onClick={() => openListed(row)}>
                        {row.issue.brandName} ({row.issue.ticker})
                      </button>
                      <span> {coverageLine(view.flag, view.reserveSats, view.liabilitySats)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {desk.notice && <p className="status ok">{desk.notice}</p>}
          {combinedError && <p className="status err">{combinedError}</p>}
          {desk.rejection && desk.rejection !== redeemBlock && (
            <p className="status err" role="alert">{desk.rejection}</p>
          )}
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
          <p>Recording uses a BSV Desktop wallet.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {issue && <p>Scrip id <code>{issue.scripId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          {latest && <p>Attestation <code>{latest.attestation}</code></p>}
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
