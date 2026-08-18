import { useEffect, useState } from 'react'
import type { WalletClient } from '@bsv/sdk'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  DEFAULT_AMOUNT_SATS,
  DEFAULT_DURATION_DAYS,
  FUNDABLE_MAX_SATS,
  accrue,
  isIdentityKey
} from '../../protocol/stream'
import { claimStream, freezeStream, openStream } from './lib/actions'
import {
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayHint,
  shortKey,
  type ActionVerb
} from './lib/config'
import {
  accruedLine,
  dailyRate,
  datetimeLocalToIso,
  dayPhrase,
  defaultStartLocal,
  displayAmount,
  displaySats,
  formatWhen,
  humanReceiptId,
  statusLabel
} from './lib/copy'
import { fetchUsdPerBsv, parseSatsAmount, satsToDisplayUsd, satsToUsdInput } from './lib/money'
import { lookupStreams, type OverlayStream } from './lib/overlay'
import { goHome, goToStream, parseStreamLocation, streamPublicUrl } from './lib/route'

type View = 'home' | 'create' | 'stream'

const CHROME_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry, with Desktop unlocked.'

function ChromeHint() {
  return <p className="helper chrome-hint">{CHROME_HINT}</p>
}

function InstallPrompt({
  verb,
  onRetry
}: {
  verb: ActionVerb
  onRetry: () => void
}) {
  const label = verb === 'open' ? 'open' : verb === 'claim' ? 'claim' : 'freeze'
  return (
    <div className="install">
      <p>
        To {label} this, Chrome must be allowed to talk to apps on this device, and
        Desktop must be unlocked. Allow, then Retry.
      </p>
      <div className="row">
        <button className="btn primary" onClick={onRetry}>Retry</button>
        <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
          Install BSV Desktop
        </a>
      </div>
    </div>
  )
}

function Advanced() {
  const { url, setUrl, online } = useOverlay()
  const { identityKey } = useWallet()

  return (
    <details className="advanced">
      <summary>Advanced</summary>
      <label htmlFor="overlay-url">Overlay URL</label>
      <input
        id="overlay-url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
        autoComplete="off"
      />
      <p className="hint">
        {online === true ? 'Reachable.' : online === false ? 'Not reachable from this browser.' : 'Checking…'}
        {' '}{overlayHint(url)}
      </p>
      {identityKey && (
        <p className="hint">
          Wallet key <code>{shortKey(identityKey, 8)}</code>
        </p>
      )}
    </details>
  )
}

function Home({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>StreamPay</h1>
          <p className="lede">Open a stream. They claim what’s accrued. You can freeze it.</p>
        </div>
      </header>

      <section className="panel ghost-wrap">
        <div className="ghost" aria-hidden="true">
          <div className="ghost-head">
            <span className="stamp open fat">Open</span>
            <strong>100,000 sats</strong>
          </div>
          <p className="memo">Legal research week</p>
          <p className="hint">21,428 sats accrued · 0 sats claimed</p>
        </div>
        <p className="empty-sell">Pay as they work.</p>
        <button className="btn primary" onClick={onCreate}>Open a stream</button>
      </section>

      <Advanced />
    </div>
  )
}

function Create({
  onOpened,
  onBack
}: {
  onOpened: (streamId: string, txid: string) => void
  onBack: () => void
}) {
  const { url } = useOverlay()
  const { connect, connecting } = useWallet()
  const [orgName, setOrgName] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [contractorIdentity, setContractorIdentity] = useState('')
  const [memo, setMemo] = useState('Legal research week')
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT_SATS))
  const [days, setDays] = useState(String(DEFAULT_DURATION_DAYS))
  const [startLocal, setStartLocal] = useState(defaultStartLocal)
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchUsdPerBsv()
      .then((rate) => {
        if (cancelled) return
        setUsdPerBsv(rate)
        setRateError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setUsdPerBsv(null)
        setRateError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  const send = async (): Promise<void> => {
    setError(null)
    setShowInstall(false)
    if (!orgName.trim() || !contractorName.trim() || !memo.trim()) {
      setError('Fill in org name, contractor, and what it’s for.')
      return
    }
    const identity = contractorIdentity.trim()
    if (!isIdentityKey(identity)) {
      setError('Contractor identity is needed to open a funded stream.')
      return
    }
    const durationDays = Number(days)
    if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 3650) {
      setError('Duration should be at least one day.')
      return
    }
    let startIso: string
    try {
      startIso = datetimeLocalToIso(startLocal)
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    if (!url) {
      setError('This page needs an overlay URL before it can open a stream. Open Advanced.')
      return
    }
    let sats: number
    try {
      sats = parseSatsAmount(amount)
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    if (sats > FUNDABLE_MAX_SATS) {
      setError('That’s more than this wallet can fund. Try 50,000–200,000 sats.')
      return
    }
    const displayUsd = usdPerBsv ? satsToUsdInput(sats, usdPerBsv) : ''
    setBusy(true)
    let client
    try {
      client = await connect()
    } catch (err) {
      setError(errorMessage(err, 'open'))
      setShowInstall(true)
      setBusy(false)
      return
    }
    try {
      const created = await openStream(client, url, {
        org: orgName.trim(),
        contractorName: contractorName.trim(),
        contractorIdentity: identity,
        memo: memo.trim(),
        amountSats: sats,
        amountUsd: displayUsd,
        startIso,
        durationSec: Math.round(durationDays * 86_400)
      })
      onOpened(created.streamId, created.txid)
    } catch (err) {
      setError(errorMessage(err, 'open'))
      setShowInstall(true)
    } finally {
      setBusy(false)
    }
  }

  let usdPreview = ''
  try {
    usdPreview = satsToDisplayUsd(parseSatsAmount(amount), usdPerBsv)
  } catch {
    usdPreview = ''
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <button className="text-link" onClick={onBack}>StreamPay</button>
          <h1>Open a stream</h1>
          <p className="lede">You fund the stream. They claim what’s accrued from it. You can freeze the clock.</p>
        </div>
      </header>

      <section className="panel">
        <label htmlFor="org">Org name</label>
        <input
          id="org"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="Harbor Legal Aid"
          maxLength={80}
        />
        <label htmlFor="contractor">Contractor</label>
        <input
          id="contractor"
          value={contractorName}
          onChange={(event) => setContractorName(event.target.value)}
          placeholder="Jordan Lee"
          maxLength={80}
        />
        <label htmlFor="identity">Contractor identity</label>
        <input
          id="identity"
          value={contractorIdentity}
          onChange={(event) => setContractorIdentity(event.target.value)}
          placeholder="Their compressed public key"
          autoComplete="off"
        />
        <p className="helper">Needed so they can claim accrued pay from the stream you fund.</p>
        <label htmlFor="memo">What it’s for</label>
        <input
          id="memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="Legal research week"
          maxLength={200}
        />
        <div className="grid">
          <div>
            <label htmlFor="amount">Amount (sats)</label>
            <div className="dollar">
              <input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span>sats</span>
            </div>
          </div>
          <div>
            <label htmlFor="days">Duration (days)</label>
            <input
              id="days"
              inputMode="numeric"
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </div>
        </div>
        <label htmlFor="start">Start</label>
        <input
          id="start"
          type="datetime-local"
          value={startLocal}
          onChange={(event) => setStartLocal(event.target.value)}
        />
        <p className="helper">Defaults to three days ago so a mid-stream claim is demoable without waiting. Settlement is sats. Dollars are display only.</p>
        {usdPreview && <p className="hint">About {usdPreview} at the current rate.</p>}
        {rateError && (
          <p className="helper">Dollar rate unavailable. You can still open — the stream is funded in sats.</p>
        )}
        <div className="row" style={{ marginTop: 20 }}>
          <button
            className="btn primary"
            disabled={busy || connecting}
            onClick={() => void send()}
          >
            {busy || connecting ? 'Approve in your wallet…' : 'Open'}
          </button>
        </div>
        {!(busy || connecting || showInstall) && (
          <p className="helper">We’ll ask you to fund this stream in a moment. Default is {DEFAULT_AMOUNT_SATS.toLocaleString('en-US')} sats over {DEFAULT_DURATION_DAYS} days.</p>
        )}
        {(busy || connecting || showInstall) && <ChromeHint />}
        {showInstall && <InstallPrompt verb="open" onRetry={() => void send()} />}
        {error && <p className="status err">{error}</p>}
      </section>

      <Advanced />
    </div>
  )
}

function StreamPage({
  streamId,
  createTxid,
  onHome
}: {
  streamId: string
  createTxid: string | null
  onHome: () => void
}) {
  const { url } = useOverlay()
  const { connect, connecting } = useWallet()
  const [stream, setStream] = useState<OverlayStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [busyVerb, setBusyVerb] = useState<ActionVerb>('claim')
  const [showInstall, setShowInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const [justClaimed, setJustClaimed] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      if (!url) {
        if (!cancelled) {
          setStream(null)
          setError('This stream isn’t available right now.')
        }
        return
      }
      try {
        const rows = await lookupStreams(url, {
          streamId,
          txid: createTxid || undefined
        })
        if (cancelled) return
        const row = rows[0] ?? null
        setStream(row)
        setError(row ? null : 'This stream wasn’t found.')
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 4000)
    const onVis = (): void => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [url, streamId, createTxid])

  const copyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(streamPublicUrl(streamId, stream?.txid || createTxid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const run = async (verb: ActionVerb, action: (client: WalletClient) => Promise<void>): Promise<void> => {
    if (!stream || !url) return
    setError(null)
    setShowInstall(false)
    setBusy(true)
    setBusyVerb(verb)
    let client
    try {
      client = await connect()
    } catch (err) {
      setError(errorMessage(err, verb))
      setShowInstall(true)
      setBusy(false)
      return
    }
    try {
      await action(client)
      const rows = await lookupStreams(url, {
        streamId,
        txid: stream.txid || createTxid || undefined
      })
      setStream(rows[0] ?? stream)
    } catch (err) {
      setError(errorMessage(err, verb))
      setShowInstall(true)
    } finally {
      setBusy(false)
    }
  }

  const claim = async (): Promise<void> => {
    await run('claim', async (client) => {
      await claimStream(client, url, stream as OverlayStream)
      setJustClaimed(true)
    })
  }

  const freeze = async (): Promise<void> => {
    await run('freeze', async (client) => {
      await freezeStream(client, url, stream as OverlayStream)
    })
  }

  const math = stream ? accrue(stream, nowMs) : null
  const status = math?.status ?? 'open'
  const amount = stream ? displayAmount(stream) : ''
  const showReceipt = Boolean(stream && (justClaimed || stream.lastClaimSats > 0))

  return (
    <div className="app">
      <header className="masthead invoice-mast">
        <div>
          <button className="text-link" onClick={onHome}>StreamPay</button>
          <h1>{stream?.org || 'Stream'}</h1>
          {amount && <p className="amount-xl">{amount}</p>}
        </div>
        <span className={`stamp ${status} fat`}>{statusLabel(status)}</span>
      </header>

      {!stream && (
        <section className="panel">
          <p className="hint">{error || 'Loading stream…'}</p>
        </section>
      )}

      {stream && math && (
        <section className="panel">
          <p className="memo">{stream.memo || 'Pay as they work'}</p>
          <p className="lede">{accruedLine(stream, nowMs)}</p>
          <p className="hint">{dayPhrase(stream, nowMs)}{dailyRate(stream) ? ` · ${dailyRate(stream)} / day` : ''}</p>
          <dl>
            <div><dt>Contractor</dt><dd>{stream.contractorName || '—'}</dd></div>
            <div><dt>Rate</dt><dd>{dailyRate(stream) || '—'} / day</dd></div>
            <div><dt>Accrued</dt><dd>{displaySats(math.earnedSats, stream)}</dd></div>
            <div><dt>Claimed</dt><dd>{displaySats(stream.claimedSats, stream)}</dd></div>
            <div><dt>Claimable</dt><dd>{displaySats(math.claimableSats, stream)}</dd></div>
            <div><dt>Receipt</dt><dd>{humanReceiptId(stream.streamId)}</dd></div>
          </dl>
          <p className="helper">Anyone with this link can see the rate, what’s accrued, and whether it’s frozen. No wallet needed to look.</p>
          {(stream.satoshis ?? 1) < math.claimableSats && (
            <p className="helper">This stream isn’t funded. A claim will not invent the missing sats.</p>
          )}
          <div className="stack-actions">
            <button className="btn copy-link" onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              className="btn primary"
              disabled={busy || connecting || math.claimableSats < 1}
              onClick={() => void claim()}
            >
              {busy && busyVerb === 'claim'
                ? 'Approve in your wallet…'
                : math.claimableSats < 1
                  ? 'Nothing to claim yet'
                  : `Claim ${displaySats(math.claimableSats, stream)}`}
            </button>
            <button
              className="btn"
              disabled={busy || connecting || stream.frozen}
              onClick={() => void freeze()}
            >
              {busy && busyVerb === 'freeze' ? 'Approve in your wallet…' : stream.frozen ? 'Frozen' : 'Freeze'}
            </button>
          </div>
          {(busy || connecting || showInstall) && <ChromeHint />}
          {showInstall && <InstallPrompt verb={busyVerb} onRetry={() => void (busyVerb === 'freeze' ? freeze() : claim())} />}
          {error && <p className="status err">{error}</p>}
        </section>
      )}

      {stream && showReceipt && (
        <section className="panel receipt">
          <div className="paid-hero">
            <span className="stamp paid fat">Claimed</span>
            <p className="amount-xl">{displaySats(stream.lastClaimSats, stream)}</p>
          </div>
          <p className="memo">{stream.memo || 'Pay as they work'}</p>
          <dl>
            <div><dt>From</dt><dd>{stream.org || '—'}</dd></div>
            <div><dt>Contractor</dt><dd>{stream.contractorName || '—'}</dd></div>
            <div><dt>When</dt><dd>{formatWhen(stream.lastClaimIso) || 'Just now'}</dd></div>
            <div><dt>Receipt</dt><dd>{humanReceiptId(stream.streamId)}</dd></div>
          </dl>
          <p className="helper">You’re done. The receipt is this page.</p>
          <details className="advanced">
            <summary>Details</summary>
            <dl>
              {stream.txid && (
                <div><dt>Transaction</dt><dd><code>{stream.txid}</code></dd></div>
              )}
              <div><dt>Stream id</dt><dd><code>{stream.streamId}</code></dd></div>
              <div><dt>Protocol</dt><dd>streampay</dd></div>
            </dl>
          </details>
        </section>
      )}
    </div>
  )
}

function readRoute(): { streamId: string | null, createTxid: string | null } {
  if (typeof window === 'undefined') return { streamId: null, createTxid: null }
  return parseStreamLocation(window.location.pathname, window.location.search, window.location.hash)
}

function Shell() {
  const initial = readRoute()
  const [view, setView] = useState<View>(() => (initial.streamId ? 'stream' : 'home'))
  const [streamId, setStreamId] = useState<string | null>(() => initial.streamId)
  const [createTxid, setCreateTxid] = useState<string | null>(() => initial.createTxid)

  useEffect(() => {
    const sync = (): void => {
      const route = readRoute()
      if (route.streamId) {
        setStreamId(route.streamId)
        setCreateTxid(route.createTxid)
        setView('stream')
        return
      }
      setStreamId(null)
      setCreateTxid(null)
      setView((current) => (current === 'create' ? 'create' : 'home'))
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  if (view === 'create') {
    return (
      <Create
        onBack={() => { goHome(); setView('home') }}
        onOpened={(id, txid) => {
          goToStream(id, txid)
          setStreamId(id)
          setCreateTxid(txid)
          setView('stream')
        }}
      />
    )
  }

  if (view === 'stream' && streamId) {
    return (
      <StreamPage
        streamId={streamId}
        createTxid={createTxid}
        onHome={() => { goHome(); setView('home') }}
      />
    )
  }

  return <Home onCreate={() => setView('create')} />
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
