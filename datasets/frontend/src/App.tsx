import { useEffect, useState } from 'react'
import { sampleHashOf } from '../../protocol/dataset'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { buyDump, downloadDump, postListing } from './lib/actions'
import {
  BUY_BUTTON,
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  PAID_LINE,
  PAID_STATUS,
  POST_BUTTON,
  POST_HEADING,
  POST_JOB,
  RECEIPT_HEADING,
  STALL_HEADING,
  TITLE
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupListings, type OverlayListing } from './lib/overlay'

interface PaidReceipt {
  title: string
  license: string
  sampleHash: string
  payTxid: string
  dump: string
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<OverlayListing[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [license, setLicense] = useState('CC-BY-4.0')
  const [dump, setDump] = useState('')
  const [priceSats, setPriceSats] = useState(100)

  const [busy, setBusy] = useState<'post' | 'buy' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'post' | 'buy'>('post')
  const [lastBuyId, setLastBuyId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PaidReceipt | null>(null)

  const overlayDown = online === false
  const samplePreview = dump.trim() ? sampleHashOf(dump) : ''

  const refresh = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      setRows(await lookupListings(url))
    } catch (err) {
      console.error('Lookup failed', err)
      setRows([])
      setListError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runPost = async (): Promise<void> => {
    setLastAction('post')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('post')
    try {
      const result = await postListing(session.wallet, url, session.identityKey, {
        title,
        license,
        dump,
        priceSats
      })
      setStatus(result.overlayError
        ? `Listed. Overlay submit failed: ${result.overlayError}`
        : 'Listed.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setDump('')
        setTitle('')
      }
      await refresh()
    } catch (err) {
      console.error('Post failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runBuy = async (row: OverlayListing): Promise<void> => {
    setLastAction('buy')
    setLastBuyId(row.listingId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('buy')
    try {
      const result = await buyDump(session.wallet, url, session.identityKey, row)
      downloadDump(result.title, result.dump)
      setReceipt({
        title: result.title,
        license: result.license,
        sampleHash: result.sampleHash,
        payTxid: result.payTxid,
        dump: result.dump
      })
      setStatus(result.overlayError
        ? `${PAID_STATUS} Overlay submit failed: ${result.overlayError}`
        : PAID_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
    } catch (err) {
      console.error('Buy failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'buy') {
      const row = rows.find((item) => item.listingId === lastBuyId)
      if (row) void runBuy(row)
      return
    }
    void runPost()
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">{EYEBROW}</p>
          <h1>{TITLE}</h1>
          <p className="lede">{LEDE}</p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}

        <section className="slip">
          <div className="section-head">
            <h2>{STALL_HEADING}</h2>
            <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
              {listBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {listError && <p className="status err">{listError}</p>}
          {rows.length === 0 && !listBusy && !listError && (
            <p className="empty">{EMPTY_LIST}</p>
          )}
          {rows.length > 0 && (
            <ul className="listings">
              {rows.map((row) => (
                <li key={`${row.txid}.${row.outputIndex}`} className="listing">
                  <h3>{row.title}</h3>
                  <p className="job">{row.license}</p>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy !== null || connecting || overlayDown}
                      onClick={() => void runBuy(row)}
                    >
                      {busy === 'buy' && lastBuyId === row.listingId ? 'Getting…' : BUY_BUTTON}
                    </button>
                  </div>
                  <details className="advanced">
                    <summary>Advanced</summary>
                    <p>Sample hash <code>{shortKey(row.sampleHash)}</code></p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {receipt && (
          <section className="receipt">
            <h2>{RECEIPT_HEADING}</h2>
            <p className="facts">
              {receipt.title}
              <br />
              {receipt.license}
              <br />
              {PAID_LINE}
            </p>
            <pre className="dump">{receipt.dump}</pre>
            <details className="advanced">
              <summary>Advanced</summary>
              <p>Sample hash <code>{shortKey(receipt.sampleHash)}</code></p>
              <p><code>{shortKey(receipt.payTxid)}</code></p>
            </details>
          </section>
        )}

        <section className="block">
          <h2>{POST_HEADING}</h2>
          <p className="job">{POST_JOB}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Common Crawl news snippet, week 12"
              />
            </div>
            <div className="field">
              <label htmlFor="license">License</label>
              <input
                id="license"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                placeholder="CC-BY-4.0"
              />
            </div>
            <div className="field">
              <label htmlFor="dump">File</label>
              <textarea
                id="dump"
                rows={5}
                value={dump}
                onChange={(event) => setDump(event.target.value)}
                placeholder={'{"url":"https://example.edu/paper","text":"abstract…"}\n{"url":"https://example.edu/notes","text":"methods…"}'}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="price">Price</label>
              <input
                id="price"
                type="number"
                min={1}
                max={100000000}
                value={priceSats}
                onChange={(event) => setPriceSats(Number(event.target.value))}
              />
            </div>
            <details className="advanced">
              <summary>Advanced</summary>
              <label htmlFor="hash">Sample hash</label>
              <input
                id="hash"
                value={samplePreview ? shortKey(samplePreview) : ''}
                readOnly
                placeholder="Fills from the file"
              />
            </details>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null || connecting || overlayDown || !title.trim() || !license.trim() || !dump.trim()}
              onClick={() => void runPost()}
            >
              {busy === 'post' ? 'Posting…' : POST_BUTTON}
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
