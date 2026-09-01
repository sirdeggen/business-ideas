import { useEffect, useMemo, useState } from 'react'
import {
  PERIODS,
  decideLease,
  formatExpiry,
  formatSats,
  leasePriceSats,
  nameError,
  normalizeName,
  sameLessee,
  type PeriodDays
} from '../../protocol/namelease'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { leaseName } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DECLINED_SPEND,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  COPY_LINK,
  EMPTY,
  EYEBROW,
  FOOTER,
  LEDE,
  LOOKING,
  LOOKUP_BUTTON,
  REGISTER_BUTTON,
  RENEW_BUTTON,
  leasedLine,
  notFoundLine,
  registeredStatus,
  renewedStatus,
  sheetTitle
} from './lib/copy'
import { fetchUsdPerBsv, priceFace } from './lib/money'
import { lookupName, type OverlayLease } from './lib/overlay'
import { goToName, namePublicUrl, readNameFromLocation } from './lib/route'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readNameFromLocation(), [])
  const [draft, setDraft] = useState(initial ?? '')
  const [lookedUp, setLookedUp] = useState(initial ?? '')
  const [lease, setLease] = useState<OverlayLease | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [looked, setLooked] = useState(Boolean(initial))

  const [periodDays, setPeriodDays] = useState<PeriodDays>(90)
  const [rate, setRate] = useState<number | null>(null)

  const [busy, setBusy] = useState<'lookup' | 'register' | 'renew' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'register' | 'renew'>('register')

  const overlayDown = online === false
  const normalizedDraft = normalizeName(draft)
  const draftError = draft.trim() ? nameError(draft) : 'Enter a name.'
  const amountSats = !draftError && normalizedDraft ? leasePriceSats(normalizedDraft, periodDays) : 0
  const dollars = amountSats ? priceFace(amountSats, rate) : ''
  const leased = Boolean(lease)
  const mine = Boolean(lease && identityKey && sameLessee(lease.lessee, identityKey))

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setRate)
      .catch(() => setRate(null))
  }, [])

  const refresh = async (name = lookedUp): Promise<void> => {
    const normalized = normalizeName(name)
    if (nameError(normalized)) {
      setLease(null)
      setFromCache(false)
      setLooked(false)
      return
    }
    setListBusy(true)
    setLooked(true)
    try {
      const view = await lookupName(url, normalized)
      setLookedUp(view.name)
      setLease(view.lease)
      setFromCache(view.fromCache)
    } catch (err) {
      console.error('Lookup failed', err)
      setLease(null)
      setFromCache(false)
      setActionError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    if (initial) void refresh(initial)
  }, [url])

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
    if (draftError) {
      setActionError(draftError)
      return
    }
    const name = normalizeName(draft)
    setLookedUp(name)
    goToName(name)
    setBusy('lookup')
    void refresh(name).finally(() => setBusy(null))
  }

  const runLease = async (intent: 'register' | 'renew'): Promise<void> => {
    setLastAction(intent)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (draftError && !lookedUp) {
      setActionError(draftError)
      return
    }
    const name = normalizeName(lookedUp || draft)
    const invalid = nameError(name)
    if (invalid) {
      setActionError(invalid)
      return
    }
    if (intent === 'register' && lease) {
      const blocked = decideLease({
        current: lease,
        lessee: identityKey ?? '',
        now: new Date()
      })
      if (!blocked.ok) {
        setActionError(blocked.reason)
        return
      }
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy(intent)
    try {
      const result = await leaseName(session.wallet, url, session.identityKey, {
        name,
        periodDays
      }, lease)
      setLookedUp(result.name)
      goToName(result.name)
      setStatus(result.overlayError
        ? `${result.kind === 'renew' ? renewedStatus(result.name) : registeredStatus(result.name)} Overlay submit failed: ${result.overlayError}`
        : (result.kind === 'renew' ? renewedStatus(result.name) : registeredStatus(result.name)))
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.name)
    } catch (err) {
      console.error('Lease failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    void runLease(lastAction)
  }

  const copyLink = async (): Promise<void> => {
    if (!lookedUp) return
    await navigator.clipboard.writeText(namePublicUrl(lookedUp))
    setStatus('Link copied.')
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const title = sheetTitle(looked ? lookedUp : '')
  const showResult = looked && Boolean(lookedUp)

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">{EYEBROW}</p>
          <h1>{title}</h1>
          <p className="lede">{LEDE}</p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}
        {fromCache && lease && (
          <p className="helper">Showing last-good lease.</p>
        )}

        <section className="block">
          <h2>Look up</h2>
          <p className="job">{EMPTY}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runLookup()
                }}
                placeholder="alice"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
              {busy === 'lookup' || listBusy ? LOOKING : LOOKUP_BUTTON}
            </button>
          </div>
        </section>

        {showResult && (
          <section className="slip">
            <h2>{lease ? leasedLine(lookedUp) : notFoundLine(lookedUp)}</h2>
            {lease && (
              <dl className="meta">
                <div>
                  <dt>Until</dt>
                  <dd>{formatExpiry(lease.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Period</dt>
                  <dd>{lease.periodDays} days</dd>
                </div>
              </dl>
            )}
            <div className="fields">
              <div className="field">
                <label>Period</label>
                <div className="periods">
                  {PERIODS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={days === periodDays ? 'period active' : 'period'}
                      onClick={() => setPeriodDays(days)}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
                {dollars && <p className="price">{dollars}</p>}
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown || leased}
                onClick={() => void runLease('register')}
              >
                {busy === 'register' ? 'Registering…' : REGISTER_BUTTON}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || connecting || overlayDown || !leased}
                onClick={() => void runLease('renew')}
              >
                {busy === 'renew' ? 'Renewing…' : RENEW_BUTTON}
              </button>
              <button type="button" className="btn" onClick={() => void copyLink()}>
                {COPY_LINK}
              </button>
            </div>
          </section>
        )}

        {status && <p className="status ok">{status}</p>}
        {combinedError && <p className="status err">{combinedError}</p>}
        {combinedError === DECLINED_SPEND && (
          <p className="helper">{DECLINED_SPEND}</p>
        )}
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
        {amountSats > 0 && <p>{formatSats(amountSats)} for {periodDays} days.</p>}
        {lease && (
          <>
            <p>Lessee <code>{shortKey(lease.lessee)}</code></p>
            <p>Payment <code>{shortKey(lease.txid, 8)}</code></p>
          </>
        )}
        {mine && <p>This wallet holds that name.</p>}
        <label htmlFor="overlay-url">Overlay URL</label>
        <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <p>Operators can point this at a local indexer. Public default is overlay-us-1.</p>
      </details>

      <p className="fine-print">{FOOTER}</p>
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
