import { useEffect, useMemo, useState } from 'react'
import { FEE_SATS, formatSats, formatWhen, normalizeQuery } from '../../protocol/trace'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanRegister, registerReceipt } from './lib/actions'
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
  AMOUNT_IN_ADVANCED,
  COPY_LINK,
  EMPTY,
  EYEBROW,
  FOOTER,
  LEDE,
  LOOKING,
  LOOKUP_BUTTON,
  PAID_LABEL,
  REGISTER_BUTTON,
  REGISTER_JOB,
  RIGHTS_LABEL,
  WHAT_LABEL,
  WHO_LABEL,
  notFoundLine,
  registeredStatus,
  sheetTitle
} from './lib/copy'
import { fetchUsdPerBsv, priceFace } from './lib/money'
import { lookupTrace, type OverlayReceipt } from './lib/overlay'
import { goToTrace, readTraceFromLocation, tracePublicUrl } from './lib/route'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readTraceFromLocation(), [])
  const [draft, setDraft] = useState(initial ?? '')
  const [lookedUp, setLookedUp] = useState(initial ?? '')
  const [receipt, setReceipt] = useState<OverlayReceipt | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [looked, setLooked] = useState(Boolean(initial))

  const [what, setWhat] = useState('')
  const [who, setWho] = useState('')
  const [rights, setRights] = useState('')
  const [rate, setRate] = useState<number | null>(null)

  const [busy, setBusy] = useState<'lookup' | 'register' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)

  const overlayDown = online === false
  const dollars = priceFace(FEE_SATS, rate)
  const priceHint = dollars || AMOUNT_IN_ADVANCED
  const paidFace = receipt ? priceFace(receipt.feePaid, rate) : ''

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setRate)
      .catch(() => setRate(null))
  }, [])

  const refresh = async (query = lookedUp): Promise<void> => {
    const normalized = normalizeQuery(query)
    if (!normalized) {
      setReceipt(null)
      setFromCache(false)
      setLooked(false)
      return
    }
    setListBusy(true)
    setLooked(true)
    try {
      const view = await lookupTrace(url, normalized)
      setLookedUp(view.query)
      setReceipt(view.receipt)
      setFromCache(view.fromCache)
    } catch (err) {
      console.error('Lookup failed', err)
      setReceipt(null)
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
    const query = normalizeQuery(draft)
    if (!query) {
      setActionError(EMPTY)
      return
    }
    setLookedUp(query)
    goToTrace(query)
    setBusy('lookup')
    void refresh(query).finally(() => setBusy(null))
  }

  const runRegister = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      assertCanRegister({ what, who, rights })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('register')
    try {
      const result = await registerReceipt(session.wallet, url, session.identityKey, {
        what,
        who,
        rights
      })
      setLookedUp(result.token)
      setDraft(result.token)
      goToTrace(result.token)
      setStatus(result.overlayError
        ? `${registeredStatus(result.what)} Overlay submit failed: ${result.overlayError}`
        : registeredStatus(result.what))
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setWhat('')
        setWho('')
        setRights('')
      }
      await refresh(result.token)
    } catch (err) {
      console.error('Register failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    void runRegister()
  }

  const copyLink = async (): Promise<void> => {
    const token = receipt?.token || lookedUp
    if (!token) return
    await navigator.clipboard.writeText(tracePublicUrl(token))
    setStatus('Link copied.')
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const title = sheetTitle(receipt?.what)
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
        {fromCache && receipt && (
          <p className="helper">Showing last-good receipt.</p>
        )}

        <section className="block">
          <h2>Look up</h2>
          <p className="job">{EMPTY}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="lookup">Token or what</label>
              <input
                id="lookup"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runLookup()
                }}
                placeholder="Dawn lot 12"
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
            <h2>{receipt ? receipt.what : notFoundLine(lookedUp)}</h2>
            {receipt && (
              <dl className="meta">
                <div>
                  <dt>{WHAT_LABEL}</dt>
                  <dd>{receipt.what}</dd>
                </div>
                <div>
                  <dt>{WHO_LABEL}</dt>
                  <dd>{receipt.who}</dd>
                </div>
                <div>
                  <dt>{RIGHTS_LABEL}</dt>
                  <dd>{receipt.rights}</dd>
                </div>
                <div>
                  <dt>{PAID_LABEL}</dt>
                  <dd>{paidFace || priceHint}</dd>
                </div>
              </dl>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => void copyLink()}>
                {COPY_LINK}
              </button>
            </div>
          </section>
        )}

        <section className="block register">
          <h2>Register</h2>
          <p className="job">{REGISTER_JOB}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="what">{WHAT_LABEL}</label>
              <input
                id="what"
                value={what}
                onChange={(event) => setWhat(event.target.value)}
                placeholder="Dawn lot 12"
              />
            </div>
            <div className="field">
              <label htmlFor="who">{WHO_LABEL}</label>
              <input
                id="who"
                value={who}
                onChange={(event) => setWho(event.target.value)}
                placeholder="Harbor Co."
              />
            </div>
            <div className="field">
              <label htmlFor="rights">{RIGHTS_LABEL}</label>
              <input
                id="rights"
                value={rights}
                onChange={(event) => setRights(event.target.value)}
                placeholder="own"
              />
            </div>
            {dollars
              ? <p className="price">{dollars}</p>
              : <p className="helper">{priceHint}</p>}
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null || connecting || overlayDown || !what.trim() || !who.trim() || !rights.trim()}
              onClick={() => void runRegister()}
            >
              {busy === 'register' ? 'Registering…' : REGISTER_BUTTON}
            </button>
          </div>
        </section>

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
        <p>{formatSats(FEE_SATS)} to register.</p>
        {receipt && (
          <>
            <p>Token <code>{receipt.token}</code></p>
            <p>When {formatWhen(receipt.timestamp)}</p>
            <p>Payment <code>{shortKey(receipt.txid, 8)}</code></p>
          </>
        )}
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
