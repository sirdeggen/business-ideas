import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BOND_SATS,
  FEE_SATS,
  canRelease,
  canSlash,
  formatSats,
  formatWhen,
  normalizeQuery
} from '../../protocol/vouch'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanAttest,
  assertCanSlash,
  assertCanVouch,
  attestVouch,
  heldForVouch,
  listHeldBonds,
  releaseVouch,
  slashVouch,
  stakeVouch,
  type HeldBond
} from './lib/actions'
import {
  AMOUNT_IN_ADVANCED,
  ATTEST_BUTTON,
  ATTEST_HEADING,
  ATTEST_JOB,
  BOND_LABEL,
  COPY_LINK,
  EMPTY,
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  LIST_HEADING,
  LOOKING,
  LOOKUP_BUTTON,
  NOTE_LABEL,
  PAID_LABEL,
  RELEASE_BUTTON,
  RELEASED,
  REASON_LABEL,
  SLASH_BUTTON,
  SLASHED,
  SUBJECT_LABEL,
  VOUCH_BUTTON,
  VOUCH_HEADING,
  VOUCH_JOB,
  attestedStatus,
  notFoundLine,
  sheetTitle,
  vouchedStatus
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { displayNameFor, faceName } from './lib/identity'
import { fetchUsdPerBsv, priceFace } from './lib/money'
import { lookupOpenVouches, lookupVouch, type OverlayAttest, type OverlayVouch } from './lib/overlay'
import { goToVouch, readVouchFromLocation, vouchPublicUrl } from './lib/route'

type Busy = 'lookup' | 'vouch' | 'attest' | 'slash' | 'release' | null
type LastAction = 'vouch' | 'attest' | 'slash' | 'release'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readVouchFromLocation(), [])
  const [draft, setDraft] = useState(initial ?? '')
  const [lookedUp, setLookedUp] = useState(initial ?? '')
  const [selected, setSelected] = useState<OverlayVouch | null>(null)
  const [attests, setAttests] = useState<OverlayAttest[]>([])
  const [bondOpen, setBondOpen] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [rows, setRows] = useState<OverlayVouch[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<HeldBond[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [looked, setLooked] = useState(Boolean(initial))

  const [label, setLabel] = useState('')
  const [subject, setSubject] = useState('')
  const [subjectIdentity, setSubjectIdentity] = useState('')
  const [slasher, setSlasher] = useState('')
  const [bondSats, setBondSats] = useState(DEFAULT_BOND_SATS)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [rate, setRate] = useState<number | null>(null)

  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction>('vouch')

  const overlayDown = online === false
  const feeDollars = priceFace(FEE_SATS, rate)
  const bondDollars = priceFace(bondSats, rate)
  const feeHint = feeDollars || AMOUNT_IN_ADVANCED
  const bondHint = bondDollars || AMOUNT_IN_ADVANCED
  const selectedBond = selected ? priceFace(selected.bondSats, rate) : ''

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setRate)
      .catch(() => setRate(null))
  }, [])

  const rememberNames = (keys: string[]): void => {
    const unique = [...new Set(keys.filter(Boolean))]
    void Promise.all(unique.map(async (key) => {
      const name = await displayNameFor(key)
      if (name) setNames((current) => ({ ...current, [key]: name }))
    }))
  }

  const refreshHeld = async (sessionWallet: NonNullable<typeof wallet>): Promise<HeldBond[]> => {
    const next = await listHeldBonds(sessionWallet)
    setHeld(next)
    return next
  }

  const refreshList = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      const next = await lookupOpenVouches(url)
      setRows(next)
      rememberNames(next.flatMap((row) => [row.voucher, row.slasher]))
    } catch (err) {
      console.error('List failed', err)
      setRows([])
      setListError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  const refreshLookup = async (query = lookedUp): Promise<void> => {
    const normalized = normalizeQuery(query)
    if (!normalized) {
      setSelected(null)
      setAttests([])
      setBondOpen(false)
      setFromCache(false)
      setLooked(false)
      return
    }
    setListBusy(true)
    setLooked(true)
    try {
      const view = await lookupVouch(url, normalized)
      setLookedUp(view.query)
      setSelected(view.vouch)
      setAttests(view.attests)
      setBondOpen(view.bondOpen)
      setFromCache(view.fromCache)
      if (view.vouch) {
        rememberNames([view.vouch.voucher, view.vouch.slasher, ...view.attests.map((row) => row.attestor)])
      }
    } catch (err) {
      console.error('Lookup failed', err)
      setSelected(null)
      setAttests([])
      setBondOpen(false)
      setFromCache(false)
      setActionError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshList()
    if (initial) void refreshLookup(initial)
  }, [url])

  useEffect(() => {
    if (!wallet || !identityKey) return
    void refreshHeld(wallet)
  }, [wallet, identityKey])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runLookup = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const query = normalizeQuery(draft)
    if (!query) {
      setActionError(EMPTY)
      return
    }
    setLookedUp(query)
    goToVouch(query)
    setBusy('lookup')
    void refreshLookup(query).finally(() => setBusy(null))
  }

  const openRow = (row: OverlayVouch): void => {
    setDraft(row.vouchId)
    setLookedUp(row.vouchId)
    goToVouch(row.vouchId)
    setBusy('lookup')
    void refreshLookup(row.vouchId).finally(() => setBusy(null))
  }

  const runVouch = async (): Promise<void> => {
    setLastAction('vouch')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      assertCanVouch({ label, subject, subjectIdentity, slasher, bondSats })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('vouch')
    try {
      const result = await stakeVouch(session.wallet, url, session.identityKey, {
        label,
        subject,
        subjectIdentity,
        slasher,
        bondSats
      })
      setLookedUp(result.vouchId)
      setDraft(result.vouchId)
      goToVouch(result.vouchId)
      setStatus(result.overlayError
        ? `${vouchedStatus(subject)} Overlay submit failed: ${result.overlayError}`
        : vouchedStatus(subject))
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setLabel('')
        setSubject('')
        setSubjectIdentity('')
        setSlasher('')
      }
      await refreshHeld(session.wallet)
      await refreshList()
      await refreshLookup(result.vouchId)
    } catch (err) {
      console.error('Vouch failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runAttest = async (): Promise<void> => {
    setLastAction('attest')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const vouchId = selected?.vouchId || lookedUp
    try {
      assertCanAttest({ vouchId, note })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('attest')
    try {
      const result = await attestVouch(session.wallet, url, session.identityKey, { vouchId, note })
      setStatus(result.overlayError
        ? `${attestedStatus(note)} Overlay submit failed: ${result.overlayError}`
        : attestedStatus(note))
      if (result.overlayError) setActionError(result.overlayError)
      else setNote('')
      await refreshLookup(vouchId)
    } catch (err) {
      console.error('Attest failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runSlash = async (): Promise<void> => {
    setLastAction('slash')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (!selected) return
    if (identityKey && !canSlash(selected, identityKey)) return
    const session = await ensureWallet()
    if (!session) return
    try {
      assertCanSlash(selected, session.identityKey)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const mine = heldForVouch(held, selected.vouchId)
      ?? (await refreshHeld(session.wallet)).find((item) => item.vouch.vouchId === selected.vouchId)
    if (!mine) {
      setActionError('This wallet does not hold that bond yet.')
      return
    }
    setBusy('slash')
    try {
      const result = await slashVouch(session.wallet, url, session.identityKey, mine, { reason })
      setStatus(result.overlayError
        ? `${SLASHED} Overlay submit failed: ${result.overlayError}`
        : SLASHED)
      if (result.overlayError) setActionError(result.overlayError)
      else setReason('')
      await refreshHeld(session.wallet)
      await refreshList()
      await refreshLookup(selected.vouchId)
    } catch (err) {
      console.error('Slash failed', err)
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
    setStatus(null)
    if (!selected) return
    if (identityKey && !canRelease(selected, identityKey)) return
    const session = await ensureWallet()
    if (!session) return
    if (!canRelease(selected, session.identityKey)) return
    const mine = heldForVouch(held, selected.vouchId)
      ?? (await refreshHeld(session.wallet)).find((item) => item.vouch.vouchId === selected.vouchId)
    if (!mine) {
      setActionError('This wallet does not hold that bond yet.')
      return
    }
    setBusy('release')
    try {
      const result = await releaseVouch(session.wallet, url, session.identityKey, mine)
      setStatus(result.overlayError
        ? `${RELEASED} Overlay submit failed: ${result.overlayError}`
        : RELEASED)
      if (result.overlayError) setActionError(result.overlayError)
      await refreshHeld(session.wallet)
      await refreshList()
      await refreshLookup(selected.vouchId)
    } catch (err) {
      console.error('Release failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'attest') {
      void runAttest()
      return
    }
    if (lastAction === 'slash') {
      void runSlash()
      return
    }
    if (lastAction === 'release') {
      void runRelease()
      return
    }
    void runVouch()
  }

  const copyLink = async (): Promise<void> => {
    const id = selected?.vouchId || lookedUp
    if (!id) return
    await navigator.clipboard.writeText(vouchPublicUrl(id))
    setStatus('Link copied.')
  }

  const canActSlash = (row: OverlayVouch): boolean => {
    if (!identityKey) return true
    return canSlash(row, identityKey)
  }

  const canActRelease = (row: OverlayVouch): boolean => {
    if (!identityKey) return true
    return canRelease(row, identityKey)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const title = sheetTitle(selected?.subject)
  const showResult = looked && Boolean(lookedUp)
  const voucherFace = selected ? faceName(names[selected.voucher]) : ''

  return (
    <div className="room">
      <div className={`scene-crop ${selected ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="Two colleagues staking a slashable vouch for a supplier at a modern desk."
          width="1400"
          height="788"
        />
      </div>
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{title}</h1>
            <p className="lede">{LEDE}</p>
          </header>

          <BusinessCase />

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}
          {fromCache && selected && (
            <p className="helper">Showing last-good vouch.</p>
          )}

          <section className="slip">
            <h2>Look up</h2>
            <p className="job">{EMPTY}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="lookup">Id or supplier</label>
                <input
                  id="lookup"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="North Mill"
                />
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || listBusy}
                onClick={runLookup}
              >
                {busy === 'lookup' || (listBusy && looked) ? LOOKING : LOOKUP_BUTTON}
              </button>
              {selected && (
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {COPY_LINK}
                </button>
              )}
            </div>
          </section>

          {showResult && !selected && !listBusy && (
            <p className="empty">{notFoundLine(lookedUp)}</p>
          )}

          {selected && (
            <section className="block">
              <h2>{selected.label}</h2>
              <p className="subject">{selected.subject}</p>
              <p className="job">{voucherFace}</p>
              <p className="price">
                {BOND_LABEL} {selectedBond || AMOUNT_IN_ADVANCED}
              </p>
              <p className="job">
                {bondOpen ? 'Bond still stands.' : 'Bond is closed.'} {formatWhen(selected.timestamp)}
              </p>
              {attests.length > 0 && (
                <ul className="attests">
                  {attests.map((row) => (
                    <li key={`${row.txid}.${row.outputIndex}`} className="attest">
                      {row.note}
                    </li>
                  ))}
                </ul>
              )}
              {bondOpen && canActSlash(selected) && (
                <div className="field">
                  <label htmlFor="reason">{REASON_LABEL}</label>
                  <input
                    id="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Proven bad faith"
                  />
                </div>
              )}
              {bondOpen && (
                <div className="actions">
                  {canActSlash(selected) && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy !== null || connecting || overlayDown || !reason.trim()}
                      onClick={() => void runSlash()}
                    >
                      {busy === 'slash' ? 'Slashing…' : SLASH_BUTTON}
                    </button>
                  )}
                  {canActRelease(selected) && (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy !== null || connecting || overlayDown}
                      onClick={() => void runRelease()}
                    >
                      {busy === 'release' ? 'Releasing…' : RELEASE_BUTTON}
                    </button>
                  )}
                </div>
              )}
              <details className="advanced">
                <summary>Advanced</summary>
                <p>Id <code>{selected.vouchId}</code></p>
                {selected.txid && <p>Tx <code>{shortKey(selected.txid)}</code></p>}
                <p>Bond {formatSats(selected.bondSats)}</p>
                <p>{PAID_LABEL} {formatSats(selected.writeFeeSats)}</p>
              </details>
            </section>
          )}

          <section className="block">
            <div className="section-head">
              <h2>{LIST_HEADING}</h2>
              <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshList()}>
                {listBusy && !looked ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {listError && <p className="status err">{listError}</p>}
            {rows.length === 0 && !listBusy && !listError && (
              <p className="empty">{EMPTY_LIST}</p>
            )}
            {rows.length > 0 && (
              <ul className="listings">
                {rows.map((row) => (
                  <li
                    key={`${row.txid}.${row.outputIndex}`}
                    className={selected?.vouchId === row.vouchId ? 'listing selected' : 'listing'}
                  >
                    <h3>{row.label}</h3>
                    <p className="subject">{row.subject}</p>
                    <p className="price">{priceFace(row.bondSats, rate) || AMOUNT_IN_ADVANCED}</p>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={busy !== null}
                        onClick={() => openRow(row)}
                      >
                        {LOOKUP_BUTTON}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="block">
            <h2>{VOUCH_HEADING}</h2>
            <p className="job">{VOUCH_JOB}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="label">Label</label>
                <input
                  id="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Harbor steel"
                />
              </div>
              <div className="field">
                <label htmlFor="subject">{SUBJECT_LABEL}</label>
                <input
                  id="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="North Mill"
                />
              </div>
              <p className="price">{BOND_LABEL} {bondHint}</p>
              <p className="job">Write fee {feeHint}</p>
              <details className="advanced">
                <summary>Advanced</summary>
                <label htmlFor="bond">Bond</label>
                <input
                  id="bond"
                  type="number"
                  min={1}
                  max={100000000}
                  value={bondSats}
                  onChange={(event) => setBondSats(Number(event.target.value))}
                />
                <label htmlFor="subjectKey">Supplier account</label>
                <input
                  id="subjectKey"
                  value={subjectIdentity}
                  onChange={(event) => setSubjectIdentity(event.target.value)}
                  placeholder="Optional account"
                />
                <label htmlFor="slasher">Designated slasher</label>
                <input
                  id="slasher"
                  value={slasher}
                  onChange={(event) => setSlasher(event.target.value)}
                  placeholder="Defaults to you"
                />
                <p>Bond {formatSats(bondSats)}. Write fee {formatSats(FEE_SATS)}.</p>
                <p>Amounts are in sats.</p>
              </details>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown || !label.trim() || !subject.trim()}
                onClick={() => void runVouch()}
              >
                {busy === 'vouch' ? 'Vouching…' : VOUCH_BUTTON}
              </button>
            </div>
          </section>

          <section className="block">
            <h2>{ATTEST_HEADING}</h2>
            <p className="job">{ATTEST_JOB}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="note">{NOTE_LABEL}</label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Checked incorporation and bank letter."
                />
              </div>
              <p className="job">Write fee {feeHint}</p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown || !note.trim() || !(selected?.vouchId || lookedUp)}
                onClick={() => void runAttest()}
              >
                {busy === 'attest' ? 'Posting…' : ATTEST_BUTTON}
              </button>
            </div>
          </section>

          {status && <p className="status ok">{status}</p>}
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
          <summary>Overlay URL</summary>
          <p>Operators can point this at a local indexer.</p>
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </details>

        <p className="fine-print">
          {FOOTER}
        </p>
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
