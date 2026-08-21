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
import { downloadDump, payAndExport, postRecord } from './lib/actions'
import {
  ADVANCED_ACCOUNT,
  ADVANCED_GATE,
  BANNER,
  EMPTY_LIST,
  EXPORT_BUTTON,
  EXPORT_DONE,
  EXPORT_HEADING,
  EXPORT_JOB,
  EYEBROW,
  FOOTER,
  LEDE,
  POST_HEADING,
  POST_JOB,
  TITLE
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { loadRecordsList } from './lib/list'
import { fetchUsdPerBsv, formatSatsAmount } from './lib/money'
import { type OverlayRecord } from './lib/overlay'

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
      const result = await loadRecordsList(url, wallet)
      setRows(result.rows)
      setListHint(result.hint)
      setListError(result.error)
    } catch (err) {
      console.error('Lookup failed', err)
      setListError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshList()
  }, [url, wallet])

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
      setExportStatus(EXPORT_DONE)
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
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">{EYEBROW}</p>
          <h1>{TITLE}</h1>
          <p className="lede">{LEDE}</p>
        </header>

        <p className={online === false ? 'status err' : 'helper'}>
          {online === false
            ? `${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`
            : BANNER}
        </p>

        <section className="block">
          <h2>{POST_HEADING}</h2>
          <p className="job">{POST_JOB}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="kind">Kind</label>
              <select id="kind" value={kind} onChange={(event) => setKind(event.target.value as RecordKind)}>
                {KINDS.map((item) => (
                  <option key={item} value={item}>{kindLabel(item)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="note">Reading</label>
              <textarea
                id="note"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did you see?"
              />
            </div>
            <div className="grid">
              <div className="field">
                <label htmlFor="lat">Latitude (optional)</label>
                <input
                  id="lat"
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="field">
                <label htmlFor="lon">Longitude (optional)</label>
                <input
                  id="lon"
                  value={lon}
                  onChange={(event) => setLon(event.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>
          </div>
          <details className="advanced">
            <summary>Advanced</summary>
            <p>
              {ADVANCED_ACCOUNT}
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
          <div className="actions">
            <button
              type="button"
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

        <section className="slip">
          <div className="section-head">
            <h2>{EXPORT_HEADING}</h2>
            <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshList()}>
              {listBusy ? 'Refreshing…' : 'Refresh list'}
            </button>
          </div>
          <p className="job">{EXPORT_JOB}</p>
          {listError && <p className="status err">{listError}</p>}
          {listHint && <p className="helper">{listHint}</p>}
          {rows.length === 0 && !listBusy && !listError && (
            <p className="empty">{EMPTY_LIST}</p>
          )}
          {rows.length > 0 && (
            <ul className="records">
              {rows.map((row) => (
                <li key={`${row.txid}.${row.outputIndex}`} className="record">
                  <div className="record-head">
                    <h3>{displayName(row.name)}</h3>
                    <span className="kind">{kindLabel(row.kind)}</span>
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
                      type="button"
                      className="btn primary"
                      disabled={exportBusy !== null || connecting}
                      onClick={() => void exportRow(row)}
                    >
                      {exportBusy === row.hash
                        ? 'Paying…'
                        : EXPORT_BUTTON}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <details className="advanced">
            <summary>Advanced</summary>
            <p>
              {ADVANCED_GATE}
              {' '}Export is <span className="money">{formatSatsAmount(1, usdPerBsv)}</span> for a name-only reading,
              or <span className="money">{formatSatsAmount(EXPORT_PRICE_SATS, usdPerBsv)}</span> when an account id is present.
            </p>
          </details>
          {exportStatus && <p className="status ok">{exportStatus}</p>}
          {exportError && <p className="status err">{exportError}</p>}
        </section>
      </article>

      {showInstall && (
        <div className="install">
          <div className="row">
            <button
              type="button"
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
        </div>
      )}
      {(actionError === CHROME_ALLOW_HINT) && (
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
