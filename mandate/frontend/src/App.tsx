import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHANGE_FIELDS,
  DEFAULT_CAP_SATS,
  DEFAULT_FEE_BPS,
  DEFAULT_FUND_SATS,
  DEFAULT_GAIN_SATS,
  DEFAULT_NOTICE_DAYS,
  DEFAULT_PERIOD_DAYS,
  SAMPLE_DESTINATION,
  SAMPLE_MANAGER,
  emptyDesk,
  fundMandate,
  markGain,
  openMandate,
  pendingChanges,
  positionOf,
  proposeChange,
  recallMandate,
  sendMandate,
  type DeskState
} from '../../protocol/mandate'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanOpen, parseWhole, recordMandate } from './lib/actions'
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
  BOOK_EMPTY,
  BOOK_HEADING,
  CAP_LABEL,
  CHANGE_BUTTON,
  CHANGE_FIELD_LABEL,
  CHANGE_JOB,
  CHANGE_VALUE_LABEL,
  DESK_NOTE,
  DESTINATION_LABEL,
  EYEBROW,
  FEE_HELPER,
  FEE_LABEL,
  FOOTER,
  FUND_BUTTON,
  FUND_JOB,
  FUND_LABEL,
  GAIN_BUTTON,
  GAIN_JOB,
  GAIN_LABEL,
  LEDE,
  LINE_BALANCE,
  LINE_CAP,
  LINE_FEE,
  LINE_LOCK,
  LINE_WHITELIST,
  LOCAL_NOTE,
  MANAGER_LABEL,
  NOTICE_LABEL,
  OPEN_BUTTON,
  OPEN_JOB,
  ORG_LABEL,
  PERIOD_LABEL,
  RECEIPT_NOTE,
  RECALL_BUTTON,
  RECALL_JOB,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  REFRESH_BUTTON,
  SCENE_ALT,
  SEND_BUTTON,
  SEND_JOB,
  STRANGER_LINE,
  TITLE,
  WHITELIST_LABEL,
  formatAmount,
  formatWhen
} from './lib/copy'
import { bookFromItems, lookupMandate, lookupMandateItems, type ListedMandate } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { goHome, goToMandate, mandatePublicUrl, readMandateFromLocation } from './lib/route'

type Busy = 'record' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readMandateFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [orgName, setOrgName] = useState('Harbor HOA Reserve')
  const [managerKey, setManagerKey] = useState(SAMPLE_MANAGER)
  const [whitelist, setWhitelist] = useState(SAMPLE_DESTINATION)
  const [cap, setCap] = useState(String(DEFAULT_CAP_SATS))
  const [periodDays, setPeriodDays] = useState(String(DEFAULT_PERIOD_DAYS))
  const [feeBps, setFeeBps] = useState(String(DEFAULT_FEE_BPS))
  const [noticeDays, setNoticeDays] = useState(String(DEFAULT_NOTICE_DAYS))
  const [fundAmount, setFundAmount] = useState(String(DEFAULT_FUND_SATS))
  const [gainAmount, setGainAmount] = useState(String(DEFAULT_GAIN_SATS))
  const [destination, setDestination] = useState(SAMPLE_DESTINATION)
  const [sendAmount, setSendAmount] = useState('25000')
  const [changeField, setChangeField] = useState<(typeof CHANGE_FIELDS)[number]>('cap')
  const [changeValue, setChangeValue] = useState('50000')
  const [book, setBook] = useState<ListedMandate[]>([])
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const mandate = desk.mandate
  const position = mandate ? positionOf(desk) : null
  const waiting = mandate ? pendingChanges(desk) : []

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!mandate || readonly) return
    saveDesk(mandate.mandateId, desk)
  }, [desk, mandate, readonly])

  useEffect(() => {
    let cancel = false
    void lookupMandateItems(url)
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
    const located = readMandateFromLocation()
    if (!located.mandateId) return
    const local = loadDesk(located.mandateId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupMandate(url, located.mandateId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote?.mandate) return
        setDesk(remote)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This mandate wasn’t found.')
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

  const apply = (next: DeskState): void => {
    setDesk(next)
    setActionError(next.rejection)
    setActionNeedsInstall(false)
  }

  const runOpen = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const periodCapSats = parseWhole(cap)
    const days = parseWhole(periodDays)
    const fee = parseWhole(feeBps)
    const notice = parseWhole(noticeDays)
    try {
      const ready = assertCanOpen({
        orgName,
        managerKey,
        whitelist,
        periodCapSats: periodCapSats ?? 0,
        periodDays: days ?? 0,
        feeBps: fee ?? 0,
        noticeDays: notice ?? 0
      })
      const next = openMandate(ready)
      setDesk(next)
      setReadonly(false)
      setActionError(null)
      if (next.mandate) goToMandate(next.mandate.mandateId)
    } catch (err) {
      fail(err)
    }
  }

  const runFund = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const amount = parseWhole(fundAmount)
    try {
      apply(fundMandate(desk, amount ?? 0))
    } catch (err) {
      fail(err)
    }
  }

  const runGain = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const amount = parseWhole(gainAmount)
    try {
      apply(markGain(desk, amount ?? -1))
    } catch (err) {
      fail(err)
    }
  }

  const runSend = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const amount = parseWhole(sendAmount)
    try {
      apply(sendMandate(desk, destination, amount ?? 0))
    } catch (err) {
      fail(err)
    }
  }

  const runRecall = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      apply(recallMandate(desk))
    } catch (err) {
      fail(err)
    }
  }

  const runChange = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      apply(proposeChange(desk, changeField, changeValue))
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
      const result = await recordMandate(session.wallet, url, session.identityKey, desk)
      if (mandate && result.mandateId !== mandate.mandateId) clearDesk(mandate.mandateId)
      setDesk(result.desk)
      setHintTxid(result.txid)
      goToMandate(result.mandateId, result.txid)
      if (result.unsignedSends > 0) {
        setActionError('The manager key has not signed the sends, so the public book will not count them.')
      } else {
        setActionError(result.overlayError ?? null)
      }
      const items = await lookupMandateItems(url).catch(() => null)
      if (items) setBook(bookFromItems(items))
    } catch (err) {
      console.error('Record mandate failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (mandate) clearDesk(mandate.mandateId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!mandate) return
    try {
      await navigator.clipboard.writeText(mandatePublicUrl(mandate.mandateId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const openListed = (row: ListedMandate): void => {
    const local = loadDesk(row.mandateId)
    if (local) {
      setDesk(local)
      setReadonly(false)
    } else {
      setDesk({
        mandate: row.mandate,
        funds: row.funds,
        gains: row.gains,
        sends: row.sends,
        recalls: row.recalls,
        changes: row.changes,
        rejection: null,
        notice: null
      })
      setReadonly(true)
    }
    setHintTxid(row.txid ?? '')
    goToMandate(row.mandateId, row.txid)
  }

  const refreshBook = (): void => {
    void lookupMandateItems(url)
      .then((items) => {
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  const combinedError = actionError || walletError

  return (
    <div className="table-scene">
      <div className={`scene-crop ${mandate ? 'sliver' : 'hero'}`}>
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
          <p className="receipt-note">{RECEIPT_NOTE}</p>

          {!mandate && (
            <section className="block">
              <p className="job">{OPEN_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="org">{ORG_LABEL}</label>
                  <input id="org" value={orgName} maxLength={80} onChange={(event) => setOrgName(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="manager-key">{MANAGER_LABEL}</label>
                  <input id="manager-key" value={managerKey} spellCheck={false} onChange={(event) => setManagerKey(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="whitelist">{WHITELIST_LABEL}</label>
                  <input id="whitelist" value={whitelist} spellCheck={false} onChange={(event) => setWhitelist(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="period-cap">{CAP_LABEL}</label>
                    <input id="period-cap" inputMode="numeric" value={cap} onChange={(event) => setCap(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="period-days">{PERIOD_LABEL}</label>
                    <input id="period-days" inputMode="numeric" value={periodDays} onChange={(event) => setPeriodDays(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="fee-bps">{FEE_LABEL}</label>
                    <input id="fee-bps" inputMode="numeric" value={feeBps} onChange={(event) => setFeeBps(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="notice-days">{NOTICE_LABEL}</label>
                    <input id="notice-days" inputMode="numeric" value={noticeDays} onChange={(event) => setNoticeDays(event.target.value)} />
                  </div>
                </div>
              </div>
              <p className="helper">{FEE_HELPER}</p>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runOpen}>
                  {OPEN_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && position && (
            <section className="block" id="mandate-summary">
              <div className="seal-card">
                <p className="seal-kicker">{mandate.orgName}</p>
                <h2>Outside manager</h2>
                <p className="seal-number">{shortKey(mandate.managerKey, 8)}</p>
              </div>
              <dl className="fees">
                <div>
                  <dt>{LINE_BALANCE}</dt>
                  <dd>{formatAmount(position.balanceSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_CAP}</dt>
                  <dd id="cap-line">{formatAmount(position.remainingCapSats)} of {formatAmount(position.terms.periodCapSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_FEE}</dt>
                  <dd id="fee-line">{formatAmount(position.accruedFeeSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_WHITELIST}</dt>
                  <dd id="whitelist-line">{position.terms.whitelist.length} destination{position.terms.whitelist.length === 1 ? '' : 's'}</dd>
                </div>
                <div>
                  <dt>{LINE_LOCK}</dt>
                  <dd id="owner-lock">Owner signing key and OP_CHECKSIG</dd>
                </div>
              </dl>
              <p className="helper">{DESK_NOTE}</p>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" onClick={startOver}>Start over</button>
              </div>
            </section>
          )}

          {desk.sends.length > 0 && (
            <p id="send-line">Last send {formatAmount(desk.sends.at(-1)?.amountSats ?? 0)} sats to {shortKey(desk.sends.at(-1)?.destinationKey ?? '', 8)}.</p>
          )}
          {desk.recalls.length > 0 && (
            <p id="recall-line">Owner pulled back {formatAmount(desk.recalls.at(-1)?.amountSats ?? 0)} sats.</p>
          )}
          {waiting.length > 0 && (
            <p id="notice-line">
              Change to {waiting.at(-1)?.field} applies {formatWhen(waiting.at(-1)?.effectiveAt ?? '')}. The current rules stay until then. The notice clock is recorded. The script does not read it.
            </p>
          )}

          {mandate && !readonly && (
            <section className="slip">
              <p className="job">{FUND_JOB}</p>
              <div className="field">
                <label htmlFor="fund-amount">{FUND_LABEL}</label>
                <input id="fund-amount" inputMode="numeric" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runFund}>
                  {FUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && !readonly && (
            <section className="slip">
              <p className="job">{GAIN_JOB}</p>
              <div className="field">
                <label htmlFor="gain-amount">{GAIN_LABEL}</label>
                <input id="gain-amount" inputMode="numeric" value={gainAmount} onChange={(event) => setGainAmount(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null} onClick={runGain}>
                  {GAIN_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && !readonly && (
            <section className="slip">
              <p className="job">{SEND_JOB}</p>
              <div className="grid">
                <div className="field">
                  <label htmlFor="destination">{DESTINATION_LABEL}</label>
                  <input id="destination" value={destination} spellCheck={false} onChange={(event) => setDestination(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="send-amount">{AMOUNT_LABEL}</label>
                  <input id="send-amount" inputMode="numeric" value={sendAmount} onChange={(event) => setSendAmount(event.target.value)} />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runSend}>
                  {SEND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && !readonly && (
            <section className="slip">
              <p className="job">{RECALL_JOB}</p>
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null} onClick={runRecall}>
                  {RECALL_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && !readonly && (
            <section className="slip">
              <p className="job">{CHANGE_JOB}</p>
              <div className="grid">
                <div className="field">
                  <label htmlFor="change-field">{CHANGE_FIELD_LABEL}</label>
                  <select id="change-field" value={changeField} onChange={(event) => setChangeField(event.target.value as (typeof CHANGE_FIELDS)[number])}>
                    {CHANGE_FIELDS.map((field) => (
                      <option key={field} value={field}>{field}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="change-value">{CHANGE_VALUE_LABEL}</label>
                  <input id="change-value" value={changeValue} spellCheck={false} onChange={(event) => setChangeValue(event.target.value)} />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null} onClick={runChange}>
                  {CHANGE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {mandate && !readonly && (
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
            <p className="job">Mandates from the public book.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {book.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {book.length > 0 && (
              <ul className="receipts">
                {book.map((row) => (
                  <li key={row.mandateId}>
                    <button type="button" className="text-btn" onClick={() => openListed(row)}>
                      {row.mandate.orgName}
                    </button>
                    <span> {formatAmount(row.funds.reduce((sum, fund) => sum + fund.amountSats, 0))} sats funded</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {desk.notice && <p className="status ok">{desk.notice}</p>}
          {combinedError && <p className="status err" role="alert">{combinedError}</p>}
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
          {mandate && <p>Mandate id <code>{mandate.mandateId}</code></p>}
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
