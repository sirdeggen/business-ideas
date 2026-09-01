import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DURATION_DAYS,
  DEFAULT_NAME,
  DEFAULT_PRICE_SATS,
  daysToSec,
  isKeyValid,
  sheetTitle
} from '../../protocol/membership'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanCreate, createMembership, joinMembership, renewMembership } from './lib/actions'
import {
  CREATE_BUTTON,
  CREATING_BUTTON,
  DURATION_LABEL,
  EXPIRED_LINE,
  EYEBROW,
  JOB,
  JOIN_BUTTON,
  JOIN_JOB,
  JOINING_BUTTON,
  RENEW_BUTTON,
  RENEWING_BUTTON,
  SHOW_EXPIRED,
  SHOW_VALID,
  STRANGER_LINE,
  durationFace,
  formatAmount,
  formatWhen,
  validUntilLine
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  readLastKeyTxid,
  shortKey,
  writeLastKeyTxid
} from './lib/config'
import { lookupMembership, type OverlayDef, type OverlayKey } from './lib/overlay'
import {
  goToMembership,
  membershipPublicUrl,
  readMembershipFromLocation
} from './lib/route'

function parseDurationSec(days: string, secondsOverride: string): number {
  const trimmed = secondsOverride.trim()
  if (trimmed) {
    const seconds = Number(trimmed)
    if (!Number.isInteger(seconds) || seconds < 1) {
      throw new Error('Duration seconds should be a whole number.')
    }
    return seconds
  }
  const value = Number(days)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Duration should be at least one day.')
  }
  return daysToSec(value)
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readMembershipFromLocation(), [])
  const [membershipId, setMembershipId] = useState(initial.membershipId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.createTxid ?? '')
  const [membership, setMembership] = useState<OverlayDef | null>(null)
  const [key, setKey] = useState<OverlayKey | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [name, setName] = useState(DEFAULT_NAME)
  const [days, setDays] = useState(String(DEFAULT_DURATION_DAYS))
  const [price, setPrice] = useState(String(DEFAULT_PRICE_SATS))
  const [secondsOverride, setSecondsOverride] = useState('')

  const [busy, setBusy] = useState<'create' | 'join' | 'renew' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'create' | 'join' | 'renew'>('create')
  const [copied, setCopied] = useState(false)
  const [asOfMs, setAsOfMs] = useState(() => Date.now())

  const overlayDown = online === false
  const valid = key ? isKeyValid(key, asOfMs) : false
  const title = sheetTitle({
    membership: Boolean(membership || membershipId),
    key: Boolean(key),
    valid
  })

  const refresh = async (id = membershipId, txid = hintTxid): Promise<void> => {
    if (!id) {
      setMembership(null)
      setKey(null)
      setLookupError(null)
      return
    }
    setListBusy(true)
    try {
      const stored = readLastKeyTxid(id)
      const view = await lookupMembership(url, id, txid || stored || undefined)
      setMembership(view.membership)
      const nextKey = view.key ?? (stored
        ? view.keys.find((row) => row.txid === stored) ?? null
        : null)
      setKey(nextKey)
      setLookupError(view.membership ? null : 'This membership wasn’t found.')
      setAsOfMs(Date.now())
    } catch {
      setMembership(null)
      setKey(null)
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, membershipId, hintTxid])

  useEffect(() => {
    const timer = window.setInterval(() => setAsOfMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [key?.txid])

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
    setStatus(null)
    let durationSec: number
    let priceSats: number
    try {
      durationSec = parseDurationSec(days, secondsOverride)
      priceSats = Number(price.replace(/,/g, ''))
      assertCanCreate({ name, durationSec, priceSats })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('create')
    try {
      const result = await createMembership(session.wallet, url, session.identityKey, {
        name: name.trim(),
        durationSec,
        priceSats
      })
      setMembershipId(result.membershipId)
      setHintTxid(result.txid)
      goToMembership(result.membershipId, result.txid)
      setStatus(result.overlayError
        ? `Membership created. Overlay submit failed: ${result.overlayError}`
        : 'Membership created. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.membershipId, result.txid)
    } catch (err) {
      console.error('Create membership failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runJoin = async (): Promise<void> => {
    setLastAction('join')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (!membership) {
      setActionError('This membership wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('join')
    try {
      const result = await joinMembership(session.wallet, url, session.identityKey, membership)
      writeLastKeyTxid(result.membershipId, result.txid)
      setHintTxid(result.txid)
      goToMembership(result.membershipId, result.txid)
      setStatus(result.overlayError
        ? `Joined. Overlay submit failed: ${result.overlayError}`
        : 'Joined. This key is good until it expires.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.membershipId, result.txid)
    } catch (err) {
      console.error('Join membership failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRenew = async (): Promise<void> => {
    setLastAction('renew')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (!membership || !key) {
      setActionError('This membership wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('renew')
    try {
      const result = await renewMembership(session.wallet, url, session.identityKey, membership, key)
      writeLastKeyTxid(result.membershipId, result.txid)
      setHintTxid(result.txid)
      goToMembership(result.membershipId, result.txid)
      setStatus(result.overlayError
        ? `Renewed. Overlay submit failed: ${result.overlayError}`
        : 'Renewed. The key is good again.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.membershipId, result.txid)
    } catch (err) {
      console.error('Renew membership failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'join') void runJoin()
    else if (lastAction === 'renew') void runRenew()
    else void runCreate()
  }

  const copyLink = async (): Promise<void> => {
    const id = membership?.membershipId || membershipId
    if (!id) return
    await navigator.clipboard.writeText(membershipPublicUrl(id, key?.txid || membership?.txid || hintTxid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">{EYEBROW}</p>
          <h1>{title}</h1>
          <p className="lede">{JOB}</p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}

        {!membershipId && (
          <section className="block">
            <p className="job">Name, duration, and price. A stranger can read the sheet with no wallet.</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={DEFAULT_NAME}
                  maxLength={80}
                />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="days">{DURATION_LABEL}</label>
                  <input
                    id="days"
                    inputMode="numeric"
                    className="amount"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="price">Price</label>
                  <input
                    id="price"
                    inputMode="numeric"
                    className="amount"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
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
          </section>
        )}

        {membershipId && !membership && !listBusy && (
          <p className="empty">{lookupError || 'This membership wasn’t found.'}</p>
        )}

        {membership && (
          <section className="block">
            <h2>{membership.name}</h2>
            <dl className="meta">
              <div>
                <dt>Duration</dt>
                <dd>{durationFace(membership.durationSec)}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd className="amount">{formatAmount(membership.priceSats)}</dd>
              </div>
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

        {membership && !key && (
          <section className="slip">
            <p className="job">{JOIN_JOB}</p>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown}
                onClick={() => void runJoin()}
              >
                {busy === 'join' ? JOINING_BUTTON : JOIN_BUTTON}
              </button>
            </div>
          </section>
        )}

        {membership && key && (
          <section className="slip show">
            <div className="show-hero">
              <span className={`stamp ${valid ? 'valid' : 'expired'} fat`}>
                {valid ? SHOW_VALID : SHOW_EXPIRED}
              </span>
            </div>
            {valid && <p className="lede">{validUntilLine(key.expiresAt)}</p>}
            {!valid && <p className="status err">{EXPIRED_LINE}</p>}
            <dl className="meta">
              <div>
                <dt>Until</dt>
                <dd>{formatWhen(key.expiresAt)}</dd>
              </div>
            </dl>
            {!valid && (
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runRenew()}
                >
                  {busy === 'renew' ? RENEWING_BUTTON : RENEW_BUTTON}
                </button>
              </div>
            )}
          </section>
        )}

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
        <summary>Advanced</summary>
        <p>Amounts are in sats.</p>
        <p>Duration is in days. For a short QA key, set seconds below.</p>
        <label htmlFor="seconds">Duration (seconds)</label>
        <input
          id="seconds"
          inputMode="numeric"
          value={secondsOverride}
          onChange={(event) => setSecondsOverride(event.target.value)}
          placeholder="Leave blank to use days"
        />
        {identityKey && (
          <p>
            Wallet key <code>{shortKey(identityKey, 8)}</code>
          </p>
        )}
        {membershipId && (
          <p>
            Membership id <code>{membershipId}</code>
          </p>
        )}
        {(key?.txid || hintTxid) && (
          <p>
            Transaction <code>{key?.txid || hintTxid}</code>
          </p>
        )}
        <label htmlFor="overlay-url">Overlay URL</label>
        <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <p>Operators can point this at a local indexer.</p>
      </details>
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
