import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_REGISTER_NAME,
  DEFAULT_UNIT_LABEL,
  isAdmin
} from '../../protocol/registry'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanCreate,
  createRegister,
  downloadReading,
  issueUnits,
  transferUnits
} from './lib/actions'
import {
  AUM_LINE,
  CREATE_BUTTON,
  CREATE_JOB,
  CREATING_BUTTON,
  EMPTY_BOOK,
  EXPORT_BUTTON,
  EXPORT_JOB,
  EYEBROW,
  FEE_FACE,
  FEE_LINE,
  ISSUE_BUTTON,
  ISSUE_JOB,
  ISSUING_BUTTON,
  JOB,
  PRODUCT,
  STRANGER_LINE,
  TRANSFER_BUTTON,
  TRANSFER_JOB,
  TRANSFERRING_BUTTON,
  feeStory,
  formatWhen,
  unitsLine
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupRegister, type RegisterView } from './lib/overlay'
import { goToRegister, parseRegisterLink, readRegisterFromLocation, registerPublicUrl } from './lib/route'

type Busy = 'create' | 'issue' | 'transfer' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect, clearError } = useWallet()

  const initial = useMemo(() => readRegisterFromLocation(), [])
  const [registerId, setRegisterId] = useState(initial.registerId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [view, setView] = useState<RegisterView | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [name, setName] = useState(DEFAULT_REGISTER_NAME)
  const [unitLabel, setUnitLabel] = useState(DEFAULT_UNIT_LABEL)
  const [totalUnits, setTotalUnits] = useState('')
  const [aumNote, setAumNote] = useState('')
  const [openLink, setOpenLink] = useState('')

  const [holder, setHolder] = useState('')
  const [issueAmount, setIssueAmount] = useState('10')
  const [fromHolder, setFromHolder] = useState('')
  const [toHolder, setToHolder] = useState('')
  const [transferAmount, setTransferAmount] = useState('1')

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('create')
  const [copied, setCopied] = useState(false)

  const overlayDown = online === false
  const record = view?.register ?? null

  const refresh = async (id = registerId, txid = hintTxid): Promise<RegisterView | null> => {
    if (!id) {
      setView(null)
      setLookupError(null)
      return null
    }
    setListBusy(true)
    try {
      const next = await lookupRegister(url, id, txid || undefined)
      setView(next)
      setLookupError(next.register ? null : 'This register wasn’t found.')
      return next
    } catch {
      setView(null)
      setLookupError('Can’t reach overlay. Retry')
      return null
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, registerId, hintTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runCreate = async (): Promise<void> => {
    setLastAction('create')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    try {
      assertCanCreate({ name, unitLabel, totalUnits, aumNote })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('create')
    try {
      const session = await ensureWallet()
      if (!session) return
      const result = await createRegister(session.wallet, url, session.identityKey, {
        name,
        unitLabel,
        totalUnits,
        aumNote
      })
      setRegisterId(result.registerId)
      setHintTxid(result.txid)
      goToRegister(result.registerId, result.txid)
      setNotice(result.overlayError
        ? `Register created. Overlay submit failed: ${result.overlayError}`
        : 'Register created. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.registerId, result.txid)
    } catch (err) {
      console.error('Create register failed', err)
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
    if (!record) {
      setActionError('This register wasn’t found.')
      return
    }
    setBusy('issue')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupRegister(url, record.registerId, hintTxid || record.txid)
      const book = current.register ?? record
      const result = await issueUnits(
        session.wallet,
        url,
        session.identityKey,
        book,
        { holder, units: issueAmount },
        current.fold.issuedUnits
      )
      setHintTxid(result.txid)
      goToRegister(result.registerId, result.txid)
      setNotice(result.overlayError
        ? `Units issued. Overlay submit failed: ${result.overlayError}`
        : 'Units issued.')
      if (result.overlayError) setActionError(result.overlayError)
      else setHolder('')
      await refresh(result.registerId, result.txid)
    } catch (err) {
      console.error('Issue units failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runTransfer = async (): Promise<void> => {
    setLastAction('transfer')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!record) {
      setActionError('This register wasn’t found.')
      return
    }
    setBusy('transfer')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupRegister(url, record.registerId, hintTxid || record.txid)
      const book = current.register ?? record
      const result = await transferUnits(
        session.wallet,
        url,
        session.identityKey,
        book,
        current.fold.holdings,
        { from: fromHolder, to: toHolder, units: transferAmount }
      )
      setHintTxid(result.txid)
      goToRegister(result.registerId, result.txid)
      setNotice(result.overlayError
        ? `Transferred. Overlay submit failed: ${result.overlayError}`
        : 'Transferred. The receipt is on the register.')
      if (result.overlayError) setActionError(result.overlayError)
      else setToHolder('')
      await refresh(result.registerId, result.txid)
    } catch (err) {
      console.error('Transfer units failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runExport = (): void => {
    if (!record || !view) return
    downloadReading(record, view.fold.holdings, view.fold.issuedUnits, view.fold.acceptedTransfers)
    setNotice('Reading exported.')
    setActionError(null)
  }

  const runOpen = (): void => {
    const parsed = parseRegisterLink(openLink)
    if (!parsed.registerId) {
      setActionError('Paste a register link.')
      return
    }
    setActionError(null)
    setNotice(null)
    clearError()
    setRegisterId(parsed.registerId)
    setHintTxid(parsed.hintTxid ?? '')
    goToRegister(parsed.registerId, parsed.hintTxid)
  }

  const retry = (): void => {
    if (lastAction === 'issue') void runIssue()
    else if (lastAction === 'transfer') void runTransfer()
    else void runCreate()
  }

  const copyLink = async (): Promise<void> => {
    const id = record?.registerId || registerId
    if (!id) return
    await navigator.clipboard.writeText(registerPublicUrl(id, hintTxid || record?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const adminHere = Boolean(record && identityKey && isAdmin(record, identityKey))

  return (
    <div className="desk">
      <div className={`scene-crop ${record ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A registrar checking a bound unit ledger beside a holdings screen."
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

          {!registerId && (
            <section className="block">
              <p className="job">{CREATE_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="register-name">Register</label>
                  <input
                    id="register-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={DEFAULT_REGISTER_NAME}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="unit-label">Unit label</label>
                  <input
                    id="unit-label"
                    value={unitLabel}
                    onChange={(event) => setUnitLabel(event.target.value)}
                    placeholder={DEFAULT_UNIT_LABEL}
                    maxLength={24}
                  />
                </div>
                <div className="field">
                  <label htmlFor="total-units">Total units</label>
                  <input
                    id="total-units"
                    value={totalUnits}
                    onChange={(event) => setTotalUnits(event.target.value)}
                    placeholder="Optional cap"
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="aum-note">AUM note</label>
                  <input
                    id="aum-note"
                    value={aumNote}
                    onChange={(event) => setAumNote(event.target.value)}
                    placeholder="Optional"
                    maxLength={160}
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runCreate()}
                >
                  {busy === 'create' ? CREATING_BUTTON : CREATE_BUTTON}
                </button>
              </div>
              <div className="field open-link">
                <label htmlFor="open-link">Open a register</label>
                <input
                  id="open-link"
                  value={openLink}
                  onChange={(event) => setOpenLink(event.target.value)}
                  placeholder="Paste a register link"
                />
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={runOpen}>
                  Open
                </button>
              </div>
            </section>
          )}

          {registerId && !record && !listBusy && (
            <p className="empty">{lookupError || 'This register wasn’t found.'}</p>
          )}

          {record && (
            <section className="block">
              <h2>{record.name}</h2>
              <dl className="meta">
                <div>
                  <dt>Unit</dt>
                  <dd>{record.unitLabel}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>
                    {record.totalUnits === null
                      ? unitsLine(view?.fold.issuedUnits ?? 0, record.unitLabel)
                      : `${unitsLine(view?.fold.issuedUnits ?? 0, record.unitLabel)} of ${unitsLine(record.totalUnits, record.unitLabel)}`}
                  </dd>
                </div>
                {record.aumNote && (
                  <div>
                    <dt>AUM note</dt>
                    <dd>{record.aumNote}</dd>
                  </div>
                )}
                <div>
                  <dt>Opened</dt>
                  <dd>{formatWhen(record.createdAt)}</dd>
                </div>
                <div>
                  <dt>Transfers</dt>
                  <dd>{view?.fold.acceptedTransfers ?? 0}</dd>
                </div>
              </dl>
              <p className="job holdings-label">Holdings</p>
              {(view?.fold.holdings.length ?? 0) === 0 && <p className="empty">{EMPTY_BOOK}</p>}
              {(view?.fold.holdings.length ?? 0) > 0 && (
                <ul className="holdings">
                  {view?.fold.holdings.map((line) => (
                    <li key={line.holder}>
                      <span>{unitsLine(line.units, record.unitLabel)}</span>
                      <code>{shortKey(line.holder, 8)}</code>
                    </li>
                  ))}
                </ul>
              )}
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{AUM_LINE}</p>
              <p className="job">{EXPORT_JOB}</p>
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
              </div>
            </section>
          )}

          {record && (
            <section className="slip">
              <p className="job">{ISSUE_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="holder">Holder</label>
                  <input
                    id="holder"
                    value={holder}
                    onChange={(event) => setHolder(event.target.value)}
                    placeholder="Identity key or share link"
                  />
                </div>
                <div className="field">
                  <label htmlFor="issue-units">Units</label>
                  <input
                    id="issue-units"
                    value={issueAmount}
                    onChange={(event) => setIssueAmount(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown || (Boolean(identityKey) && !adminHere)}
                  onClick={() => void runIssue()}
                >
                  {busy === 'issue' ? ISSUING_BUTTON : ISSUE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {record && (
            <section className="slip">
              <p className="job">{TRANSFER_JOB}</p>
              <p className="helper">{FEE_FACE}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="from-holder">From</label>
                  <input
                    id="from-holder"
                    value={fromHolder}
                    onChange={(event) => setFromHolder(event.target.value)}
                    placeholder="Leave blank for your own units"
                  />
                </div>
                <div className="field">
                  <label htmlFor="to-holder">To</label>
                  <input
                    id="to-holder"
                    value={toHolder}
                    onChange={(event) => setToHolder(event.target.value)}
                    placeholder="Identity key or share link"
                  />
                </div>
                <div className="field">
                  <label htmlFor="transfer-units">Units</label>
                  <input
                    id="transfer-units"
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runTransfer()}
                >
                  {busy === 'transfer' ? TRANSFERRING_BUTTON : TRANSFER_BUTTON}
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
          <p>{feeStory()}</p>
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {registerId && (
            <p>
              Register id <code>{registerId}</code>
            </p>
          )}
          {(hintTxid || record?.txid) && (
            <p>
              Transaction <code>{hintTxid || record?.txid}</code>
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
