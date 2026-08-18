import { useEffect, useState } from 'react'
import {
  DISPLAY_NAME_MAX,
  EXPORT_PRICE_SATS,
  KINDS,
  isIdentityKey,
  resolveContributor,
  type RecordKind
} from '../../protocol/record'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { downloadDump, exportPriceSats, payAndExport, postRecord } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  formatSats,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { fetchUsdPerBsv, formatSatsUsd } from './lib/money'
import {
  formatLookupDiagnostic,
  inspectLookupRecords,
  usesPublicAnytx,
  type OverlayRecord
} from './lib/overlay'

function displayName(name: string): string {
  return isIdentityKey(name) ? shortKey(name) : name
}

function formatTime(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function kindLabel(kind: RecordKind): string {
  if (kind === 'hours') return 'Hours'
  if (kind === 'inspection') return 'Inspection'
  return 'Note'
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, connecting, error: walletError, connect } = useWallet()

  const [name, setName] = useState('')
  const [advancedHex, setAdvancedHex] = useState('')
  const [kind, setKind] = useState<RecordKind>('note')
  const [note, setNote] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [postBusy, setPostBusy] = useState(false)
  const [postStatus, setPostStatus] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)

  const [rows, setRows] = useState<OverlayRecord[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [listHint, setListHint] = useState<string | null>(null)

  const [exportBusy, setExportBusy] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [lastExportHash, setLastExportHash] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<'post' | 'export'>('post')
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)

  const overlayDown = online === false
  const contributor = resolveContributor(name, advancedHex)
  const advancedBad = advancedHex.trim().length > 0 && !isIdentityKey(advancedHex)
  const nameTooLong = name.trim().length > DISPLAY_NAME_MAX && !isIdentityKey(name.trim())
  const postDisabled = postBusy || connecting || overlayDown || !contributor || advancedBad || nameTooLong || !note.trim()

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setUsdPerBsv)
      .catch(() => setUsdPerBsv(null))
  }, [])

  const refreshList = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    setListHint(null)
    try {
      const inspection = await inspectLookupRecords(url)
      setRows(inspection.rows)
      setListHint(formatLookupDiagnostic(inspection, usesPublicAnytx(url)) || null)
    } catch (err) {
      console.error('Lookup failed', err)
      setListError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshList()
  }, [url])

  const post = async (): Promise<void> => {
    if (overlayDown) {
      setPostError(overlayCheckFailed(probeError, url))
      return
    }
    if (advancedBad) {
      setPostError('Account id in Advanced must be a 66-character key, or leave it blank.')
      return
    }
    const resolved = resolveContributor(name, advancedHex)
    if (!resolved) {
      setPostError('Name is required (1–80 characters).')
      return
    }
    if (!note.trim()) {
      setPostError('Write the reading before posting.')
      return
    }

    setLastAction('post')
    let activeWallet = wallet
    if (!activeWallet) {
      const result = await connect()
      if (!result) return
      activeWallet = result.wallet
    }

    setPostBusy(true)
    setPostError(null)
    setPostStatus(null)
    try {
      const result = await postRecord(activeWallet, url, {
        name: resolved,
        kind,
        note,
        lat,
        lon
      })
      setPostStatus(`Posted. Hash ${shortKey(result.hash)}.`)
      if (result.overlayError) {
        setPostError(`Posted in wallet (txid ${result.txid}). Overlay submit failed: ${result.overlayError}`)
      } else {
        setPostError(null)
        setNote('')
      }
      void refreshList()
    } catch (err) {
      console.error('Post failed', err)
      setPostError(errorMessage(err))
    } finally {
      setPostBusy(false)
    }
  }

  const exportRow = async (row: OverlayRecord): Promise<void> => {
    let activeWallet = wallet
    if (!activeWallet) {
      const result = await connect()
      if (!result) return
      activeWallet = result.wallet
    }

    setLastAction('export')
    setLastExportHash(row.hash)
    setExportBusy(row.hash)
    setExportError(null)
    setExportStatus(null)
    try {
      const result = await payAndExport(activeWallet, row)
      downloadDump(result.dump)
      setExportStatus(`Paid ${formatSats(result.paidSats)}. Dump downloaded.`)
    } catch (err) {
      console.error('Export failed', err)
      setExportError(errorMessage(err))
    } finally {
      setExportBusy(null)
    }
  }

  const actionError = postError || exportError || walletError
  const showInstall = Boolean(actionError) && !overlayDown

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">Field readings</p>
          <h1>Signed record desk</h1>
          <p className="lede">
            Post a signed reading. Pay a little to export the dump.
          </p>
        </div>
      </header>

      <p className="banner">
        {online === false
          ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
          : 'Hashes are listed for free. Pay to download the dump. Wallet is only asked when you Post or Pay.'}
      </p>

      <section className="panel">
        <h2>Post a record</h2>
        <p>A contributor signs a field reading — hours, an inspection, or a note.</p>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Alex"
          autoComplete="name"
        />
        <label htmlFor="kind">Kind</label>
        <select id="kind" value={kind} onChange={(event) => setKind(event.target.value as RecordKind)}>
          {KINDS.map((item) => (
            <option key={item} value={item}>{kindLabel(item)}</option>
          ))}
        </select>
        <label htmlFor="note">Reading</label>
        <textarea
          id="note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What did you see?"
        />
        <div className="row">
          <div className="grow">
            <label htmlFor="lat">Latitude (optional)</label>
            <input
              id="lat"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              placeholder="51.5074"
            />
          </div>
          <div className="grow">
            <label htmlFor="lon">Longitude (optional)</label>
            <input
              id="lon"
              value={lon}
              onChange={(event) => setLon(event.target.value)}
              placeholder="-0.1278"
            />
          </div>
        </div>
        <details className="advanced">
          <summary>Advanced</summary>
          <p className="hint">
            Optional account id. Leave blank to post the name. Only needed if a buyer should pay you on-chain.
          </p>
          <label htmlFor="hex">Account id</label>
          <input
            id="hex"
            value={advancedHex}
            onChange={(event) => setAdvancedHex(event.target.value)}
            placeholder="Leave blank unless you already have one"
            spellCheck={false}
            autoComplete="off"
          />
        </details>
        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={postDisabled}
            onClick={() => void post()}
          >
            {postBusy ? 'Posting…' : connecting ? 'Connecting…' : 'Post'}
          </button>
        </div>
        {postStatus && <p className="status ok">{postStatus}</p>}
        {postError && <p className="status err">{postError}</p>}
      </section>

      <section className="panel">
        <div className="invoice-head">
          <h2>Buy a dump</h2>
          <button className="btn" disabled={listBusy} onClick={() => void refreshList()}>
            {listBusy ? 'Refreshing…' : 'Refresh list'}
          </button>
        </div>
        <p>
          Pay to download the dump. The overlay already holds the fields; payment is the gate here.
          {usdPerBsv != null && (
            <>
              {' '}Export is {formatSats(1)} ({formatSatsUsd(1, usdPerBsv)}) for a name-only reading,
              or {formatSats(EXPORT_PRICE_SATS)} ({formatSatsUsd(EXPORT_PRICE_SATS, usdPerBsv)}) when an account id is present.
            </>
          )}
        </p>
        {listError && <p className="status err">{listError}</p>}
        {listHint && <p className="hint">{listHint}</p>}
        {rows.length === 0 && !listBusy && !listError && (
          <p className="empty">No signed records yet — post one.</p>
        )}
        {rows.map((row) => {
          const price = exportPriceSats(row)
          const dollars = formatSatsUsd(price, usdPerBsv)
          return (
            <article key={`${row.txid}.${row.outputIndex}`} className="invoice">
              <div className="invoice-head">
                <h3>{displayName(row.name)}</h3>
                <span className="pill">{kindLabel(row.kind)}</span>
              </div>
              <dl className="meta">
                <div>
                  <dt>When</dt>
                  <dd>{formatTime(row.time)}</dd>
                </div>
                <div>
                  <dt>Hash</dt>
                  <dd><code>{shortKey(row.hash)}</code></dd>
                </div>
              </dl>
              <div className="row">
                <button
                  className="btn primary"
                  disabled={exportBusy !== null || connecting}
                  onClick={() => void exportRow(row)}
                >
                  {exportBusy === row.hash
                    ? 'Paying…'
                    : `Pay ${formatSats(price)}${dollars ? ` (${dollars})` : ''} + Export`}
                </button>
              </div>
            </article>
          )
        })}
        {exportStatus && <p className="status ok">{exportStatus}</p>}
        {exportError && <p className="status err">{exportError}</p>}
      </section>

      {showInstall && (
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            disabled={postBusy || exportBusy !== null || connecting}
            onClick={() => {
              if (lastAction === 'export') {
                const row = rows.find((item) => item.hash === lastExportHash)
                if (row) void exportRow(row)
                return
              }
              void post()
            }}
          >
            Retry
          </button>
          <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
            Install BSV Desktop
          </a>
        </div>
      )}
      {(actionError === CHROME_ALLOW_HINT) && (
        <p className="hint">{CHROME_ALLOW_HINT}</p>
      )}

      <details className="advanced">
        <summary>Overlay URL</summary>
        <p>Operators can point this at a local indexer.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </details>

      <footer>
        Pay to download the dump. Not tickets, not invoices, not a stamp card.
      </footer>
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
