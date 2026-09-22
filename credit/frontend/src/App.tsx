import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BORROWER,
  DEFAULT_DESK_FEE_BPS,
  DEFAULT_LIMIT_SATS,
  DEFAULT_NOTE,
  DEFAULT_TERM_DAYS,
  DEFAULT_UNDERWRITING_FEE_SATS,
  addDays,
  assertCanDraw,
  assertCanFlagDefault,
  assertCanRepay,
  assertCanTerm,
  canDraw,
  canFlagDefault,
  canRepay,
  isLender,
  parseCollateralList,
  termBreached,
  utcDate,
  type CreditStatus
} from '../../protocol/credit'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { drawFacility, flagDefault, openFacility, parseWhole, repayFacility } from './lib/actions'
import {
  CHECK_BUTTON,
  COLLATERAL_LINE,
  COLLATERAL_REFERENCE,
  COLLATERAL_UNSEEN,
  DEFAULTING_BUTTON,
  DEFAULT_BUTTON,
  DEFAULT_JOB,
  DRAWING_BUTTON,
  DRAW_BUTTON,
  DRAW_JOB,
  EMPTY_LIST,
  EYEBROW,
  FEE_STORY,
  FOOTER,
  NOT_LENDER,
  LEDE,
  LIST_HEADING,
  REPAYING_BUTTON,
  REPAY_BUTTON,
  REPAY_JOB,
  STRANGER_LINE,
  TERMING_BUTTON,
  TERM_BUTTON,
  TERM_JOB,
  TITLE,
  collateralFace,
  formatAmount,
  formatWhen,
  foundLine,
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
import { lookupCollateral, lookupFacilities, lookupFacility, termCollateral, type FacilityView } from './lib/overlay'
import { facilityPublicUrl, goHome, goToFacility, readFacilityFromLocation } from './lib/route'

type Busy = 'term' | 'draw' | 'repay' | 'default' | null

function stampClass(status: CreditStatus | null): string {
  if (status === 'defaulted') return 'defaulted'
  if (status === 'repaid') return 'repaid'
  if (status === 'drawn') return 'drawn'
  return 'open'
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readFacilityFromLocation(), [])
  const [facilityId, setFacilityId] = useState(initial.facilityId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [rows, setRows] = useState<FacilityView[]>([])
  const [view, setView] = useState<FacilityView | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [borrower, setBorrower] = useState(DEFAULT_BORROWER)
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT_SATS))
  const [maturity, setMaturity] = useState(() => addDays(utcDate(), DEFAULT_TERM_DAYS))
  const [collateral, setCollateral] = useState('')
  const [deskFeeBps, setDeskFeeBps] = useState(String(DEFAULT_DESK_FEE_BPS))
  const [underwritingFee, setUnderwritingFee] = useState(String(DEFAULT_UNDERWRITING_FEE_SATS))
  const [underwritingNote, setUnderwritingNote] = useState(DEFAULT_NOTE)
  const [collateralNote, setCollateralNote] = useState<string | null>(null)
  const [checkBusy, setCheckBusy] = useState(false)

  const [drawAmount, setDrawAmount] = useState('')
  const [repayAmount, setRepayAmount] = useState('')
  const [reason, setReason] = useState('Term breached. Still unpaid.')

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('term')
  const [copied, setCopied] = useState(false)

  const overlayDown = online === false
  const selected = view?.term ? view : null
  const asOf = utcDate()

  const refreshList = async (): Promise<void> => {
    setListBusy(true)
    setLookupError(null)
    try {
      const next = await lookupFacilities(url)
      setRows(next)
    } catch {
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  const refreshSelected = async (id = facilityId, txid = hintTxid): Promise<void> => {
    if (!id) {
      setView(null)
      return
    }
    setListBusy(true)
    try {
      const next = await lookupFacility(url, id, txid || undefined)
      setView(next)
      setLookupError(next.term ? null : 'This facility wasn’t found.')
    } catch {
      setView(null)
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshList()
  }, [url])

  useEffect(() => {
    void refreshSelected()
  }, [url, facilityId, hintTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const openRow = (id: string, txid?: string): void => {
    setFacilityId(id)
    setHintTxid(txid ?? '')
    goToFacility(id, txid)
  }

  const backHome = (): void => {
    setFacilityId('')
    setHintTxid('')
    setView(null)
    setLookupError(null)
    goHome()
  }

  const runCheck = async (): Promise<void> => {
    setCollateralNote(null)
    setActionError(null)
    let refs
    try {
      refs = parseCollateralList(collateral)
    } catch (err) {
      setCollateralNote(errorMessage(err))
      return
    }
    setCheckBusy(true)
    try {
      const lines: string[] = []
      for (const ref of refs) {
        const hit = await lookupCollateral(url, ref)
        const face = collateralFace(ref)
        if (hit.found === 'reference') lines.push(`${face}. ${COLLATERAL_REFERENCE}`)
        else if (hit.found === 'unseen') lines.push(`${face}. ${COLLATERAL_UNSEEN}`)
        else lines.push(`${face}. ${foundLine(hit.found)}`)
      }
      setCollateralNote(lines.join(' '))
    } catch {
      setCollateralNote('Can’t reach overlay. Retry')
    } finally {
      setCheckBusy(false)
    }
  }

  const runTerm = async (): Promise<void> => {
    setLastAction('term')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    let limitSats: number
    let feeBps: number
    let writeFee: number
    try {
      limitSats = parseWhole(limit)
      feeBps = parseWhole(deskFeeBps)
      writeFee = parseWhole(underwritingFee)
      assertCanTerm({
        borrower,
        lenderIdentity: identityKey ?? `02${'11'.repeat(32)}`,
        limitSats,
        maturity,
        collateral,
        deskFeeBps: feeBps,
        underwritingFeeSats: writeFee,
        underwritingNote
      }, asOf)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('term')
    try {
      const result = await openFacility(session.wallet, url, session.identityKey, {
        borrower,
        limitSats,
        maturity,
        collateral,
        deskFeeBps: feeBps,
        underwritingFeeSats: writeFee,
        underwritingNote
      })
      setFacilityId(result.facilityId)
      setHintTxid(result.txid)
      goToFacility(result.facilityId, result.txid)
      setNotice(result.overlayError
        ? `Term recorded. Overlay submit failed: ${result.overlayError}`
        : 'Facility recorded. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.facilityId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Term failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runDraw = async (): Promise<void> => {
    setLastAction('draw')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.term) {
      setActionError('This facility wasn’t found.')
      return
    }
    try {
      const principal = parseWhole(drawAmount)
      assertCanDraw(selected.term, selected.status, selected.outstanding, principal, asOf)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('draw')
    try {
      const result = await drawFacility(session.wallet, url, session.identityKey, selected, parseWhole(drawAmount))
      setHintTxid(result.txid)
      goToFacility(result.facilityId, result.txid)
      setNotice(result.overlayError
        ? `Draw recorded. Overlay submit failed: ${result.overlayError}`
        : 'Draw recorded. Desk fee paid with the draw.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.facilityId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Draw failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRepay = async (): Promise<void> => {
    setLastAction('repay')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.term) {
      setActionError('This facility wasn’t found.')
      return
    }
    try {
      assertCanRepay(selected.status, selected.outstanding, parseWhole(repayAmount))
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('repay')
    try {
      const result = await repayFacility(session.wallet, url, session.identityKey, selected, parseWhole(repayAmount))
      setHintTxid(result.txid)
      goToFacility(result.facilityId, result.txid)
      setNotice(result.overlayError
        ? `Repayment recorded. Overlay submit failed: ${result.overlayError}`
        : 'Repayment recorded.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.facilityId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Repay failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runDefault = async (): Promise<void> => {
    setLastAction('default')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.term) {
      setActionError('This facility wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    if (!isLender(selected.term, session.identityKey)) {
      setActionError(NOT_LENDER)
      return
    }
    try {
      assertCanFlagDefault(selected.term, selected.status, selected.outstanding, session.identityKey, reason, asOf)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('default')
    try {
      const result = await flagDefault(session.wallet, url, session.identityKey, selected, reason)
      setHintTxid(result.txid)
      goToFacility(result.facilityId, result.txid)
      setNotice(result.overlayError
        ? `Default flagged. Overlay submit failed: ${result.overlayError}`
        : 'Default flagged.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.facilityId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Default flag failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'draw') void runDraw()
    else if (lastAction === 'repay') void runRepay()
    else if (lastAction === 'default') void runDefault()
    else void runTerm()
  }

  const copyLink = async (): Promise<void> => {
    const id = selected?.facilityId || facilityId
    if (!id) return
    await navigator.clipboard.writeText(facilityPublicUrl(id, hintTxid || selected?.term?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const showDraw = (row: FacilityView): boolean => {
    if (!row.term) return false
    return canDraw(row.status, row.term.maturity, row.available, asOf)
  }

  const showRepay = (row: FacilityView): boolean => canRepay(row.status, row.outstanding)

  const showDefault = (row: FacilityView): boolean => {
    if (!row.term || row.status === 'defaulted') return false
    if (!termBreached(row.term.maturity, row.outstanding, asOf)) return false
    if (identityKey && !isLender(row.term, identityKey)) return false
    return true
  }

  const defaultReady = (row: FacilityView): boolean => {
    if (!identityKey || !row.term) return true
    return canFlagDefault(row.term, row.status, row.outstanding, identityKey, asOf)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const refs = selected?.term ? termCollateral(selected.term) : []

  return (
    <div className="room">
      <div className={`scene-crop ${selected ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A clerk recording a private credit facility against an invoice."
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

          {!facilityId && <BusinessCase />}

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!facilityId && (
            <section className="slip">
              <div className="section-head">
                <h2>{LIST_HEADING}</h2>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshList()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {lookupError && <p className="status err">{lookupError}</p>}
              {rows.length === 0 && !listBusy && !lookupError && (
                <p className="empty">{EMPTY_LIST}</p>
              )}
              {rows.length > 0 && (
                <ul className="listings">
                  {rows.map((row) => (
                    <li key={row.facilityId} className="listing">
                      <button type="button" className="open" onClick={() => openRow(row.facilityId, row.term?.txid)}>
                        <span className={`stamp ${stampClass(row.status)}`}>{row.status ? stampFor(row.status) : 'Open'}</span>
                        <h3>{row.term?.borrower}</h3>
                        <p className="meta-line">
                          <span>{row.term ? formatWhen(row.term.maturity) : ''}</span>
                          <span className="price">{row.term ? `${row.term.deskFeeBps} bps` : ''}</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!facilityId && (
            <section className="block">
              <p className="job">{TERM_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="borrower">Borrower</label>
                  <input
                    id="borrower"
                    value={borrower}
                    onChange={(event) => setBorrower(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="limit">Limit</label>
                    <input
                      id="limit"
                      inputMode="numeric"
                      className="price"
                      value={limit}
                      onChange={(event) => setLimit(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="maturity">Maturity</label>
                    <input
                      id="maturity"
                      type="date"
                      value={maturity}
                      onChange={(event) => setMaturity(event.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="collateral">Collateral</label>
                  <textarea
                    id="collateral"
                    value={collateral}
                    onChange={(event) => setCollateral(event.target.value)}
                    placeholder="Invoice id, receivable id, or receipt"
                    rows={3}
                  />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="desk-fee">Desk fee (bps)</label>
                    <input
                      id="desk-fee"
                      inputMode="numeric"
                      value={deskFeeBps}
                      onChange={(event) => setDeskFeeBps(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="write-fee">Underwriting fee</label>
                    <input
                      id="write-fee"
                      inputMode="numeric"
                      className="price"
                      value={underwritingFee}
                      onChange={(event) => setUnderwritingFee(event.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="note">Underwriting note</label>
                  <textarea
                    id="note"
                    value={underwritingNote}
                    onChange={(event) => setUnderwritingNote(event.target.value)}
                    maxLength={400}
                    rows={2}
                  />
                </div>
              </div>
              <p className="helper">{COLLATERAL_LINE}</p>
              <p className="helper">{FEE_STORY}</p>
              {collateralNote && <p className="status">{collateralNote}</p>}
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  disabled={checkBusy || busy !== null}
                  onClick={() => void runCheck()}
                >
                  {checkBusy ? 'Checking…' : CHECK_BUTTON}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runTerm()}
                >
                  {busy === 'term' ? TERMING_BUTTON : TERM_BUTTON}
                </button>
              </div>
            </section>
          )}

          {facilityId && !selected && !listBusy && (
            <p className="empty">{lookupError || 'This facility wasn’t found.'}</p>
          )}

          {selected?.term && (
            <section className="block">
              <div className="show-hero">
                <span className={`stamp ${stampClass(selected.status)} fat`}>
                  {selected.status ? stampFor(selected.status) : 'Open'}
                </span>
              </div>
              <h2>{selected.term.borrower}</h2>
              <dl className="meta">
                <div>
                  <dt>Limit</dt>
                  <dd className="price">{formatAmount(selected.term.limitSats)}</dd>
                </div>
                <div>
                  <dt>Outstanding</dt>
                  <dd className="price">{formatAmount(selected.outstanding)}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd className="price">{formatAmount(selected.available)}</dd>
                </div>
                <div>
                  <dt>Maturity</dt>
                  <dd>{formatWhen(`${selected.term.maturity}T00:00:00Z`)}</dd>
                </div>
                <div>
                  <dt>Desk fee</dt>
                  <dd>{selected.term.deskFeeBps} bps</dd>
                </div>
                <div className="wide">
                  <dt>Collateral</dt>
                  <dd>
                    {refs.length === 0 && selected.term.collateral}
                    {refs.length > 0 && (
                      <ul className="refs">
                        {refs.map((ref) => (
                          <li key={`${ref.kind}:${ref.id}`}>{collateralFace(ref)}</li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {selected.term.underwritingNote && (
                  <div className="wide">
                    <dt>Underwriting</dt>
                    <dd>{selected.term.underwritingNote}</dd>
                  </div>
                )}
              </dl>
              {(selected.draws.length > 0 || selected.repays.length > 0) && (
                <ul className="ledger">
                  {selected.draws.map((draw) => (
                    <li key={draw.drawId}>
                      Draw {formatAmount(draw.principalSats)}
                      {draw.feeSats > 0 ? ` · fee ${formatAmount(draw.feeSats)}` : ''}
                    </li>
                  ))}
                  {selected.repays.map((repay) => (
                    <li key={repay.repayId}>Repay {formatAmount(repay.amountSats)}</li>
                  ))}
                </ul>
              )}
              {selected.flag && <p className="helper">{selected.flag.reason}</p>}
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{FEE_STORY}</p>
              <p className="helper">{COLLATERAL_LINE}</p>
              {selected.status !== 'defaulted' && !termBreached(selected.term.maturity, selected.outstanding, asOf) && (
                <p className="helper">{DEFAULT_JOB}</p>
              )}
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshSelected()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="btn" onClick={backHome}>
                  All facilities
                </button>
              </div>
            </section>
          )}

          {selected && showDraw(selected) && (
            <section className="slip">
              <p className="job">{DRAW_JOB}</p>
              <div className="field">
                <label htmlFor="draw">Draw</label>
                <input
                  id="draw"
                  inputMode="numeric"
                  className="price"
                  value={drawAmount}
                  onChange={(event) => setDrawAmount(event.target.value)}
                />
              </div>
              <p className="helper">{selected.term ? `${selected.term.deskFeeBps} bps on this draw.` : FEE_STORY}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runDraw()}
                >
                  {busy === 'draw' ? DRAWING_BUTTON : DRAW_BUTTON}
                </button>
              </div>
            </section>
          )}

          {selected && showRepay(selected) && (
            <section className="slip">
              <p className="job">{REPAY_JOB}</p>
              <div className="field">
                <label htmlFor="repay">Repay</label>
                <input
                  id="repay"
                  inputMode="numeric"
                  className="price"
                  value={repayAmount}
                  onChange={(event) => setRepayAmount(event.target.value)}
                />
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runRepay()}
                >
                  {busy === 'repay' ? REPAYING_BUTTON : REPAY_BUTTON}
                </button>
              </div>
            </section>
          )}

          {selected && showDefault(selected) && (
            <section className="slip">
              <p className="job">{DEFAULT_JOB}</p>
              <div className="field">
                <label htmlFor="reason">Reason</label>
                <input
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown || !defaultReady(selected)}
                  onClick={() => void runDefault()}
                >
                  {busy === 'default' ? DEFAULTING_BUTTON : DEFAULT_BUTTON}
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
          <p>{FEE_STORY}</p>
          <p>Underwriting write fee default {formatAmount(DEFAULT_UNDERWRITING_FEE_SATS)}.</p>
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {facilityId && (
            <p>
              Facility id <code>{facilityId}</code>
            </p>
          )}
          {(hintTxid || selected?.term?.txid) && (
            <p>
              Transaction <code>{hintTxid || selected?.term?.txid}</code>
            </p>
          )}
          {selected?.term?.lenderIdentity && (
            <p>
              Lender key <code>{shortKey(selected.term.lenderIdentity, 8)}</code>
            </p>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer.</p>
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
