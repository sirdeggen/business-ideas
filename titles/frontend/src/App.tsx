import { useEffect, useState } from 'react'
import { isHolder, resolveDocHash } from '../../protocol/title'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  downloadReading,
  exportTitle,
  fulfillTransfers,
  issueTitle,
  listHeldTitles,
  transferTitle,
  type ExportReading,
  type HeldTitle
} from './lib/actions'
import {
  EMPTY_LIST,
  EXPORTED,
  EXPORT_BUTTON,
  EYEBROW,
  FOOTER,
  HELD_BY,
  ISSUE_BUTTON,
  ISSUE_HEADING,
  ISSUE_JOB,
  LEDE,
  LIST_HEADING,
  NOT_HOLDER,
  TITLE,
  TO_LABEL,
  TRANSFER_BUTTON
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { displayNameFor, holderFaceName } from './lib/identity'
import { lookupTitles, type OverlayTitle } from './lib/overlay'

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<OverlayTitle[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<HeldTitle[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [document, setDocument] = useState('')
  const [priceSats, setPriceSats] = useState(100)
  const [toById, setToById] = useState<Record<string, string>>({})
  const [transferOpen, setTransferOpen] = useState<string | null>(null)

  const [busy, setBusy] = useState<'issue' | 'transfer' | 'export' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'issue' | 'transfer' | 'export'>('issue')
  const [lastTitleId, setLastTitleId] = useState<string | null>(null)
  const [reading, setReading] = useState<ExportReading | null>(null)

  const overlayDown = online === false
  const hashPreview = document.trim() ? resolveDocHash(document) : ''

  const refreshHeld = async (sessionWallet: NonNullable<typeof wallet>): Promise<HeldTitle[]> => {
    const next = await listHeldTitles(sessionWallet)
    setHeld(next)
    return next
  }

  const refresh = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      const next = await lookupTitles(url)
      setRows(next)
      const unique = [...new Set(next.map((row) => row.holder))]
      void Promise.all(unique.map(async (key) => {
        const name = await displayNameFor(key)
        if (name) setNames((current) => ({ ...current, [key]: name }))
      }))
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

  useEffect(() => {
    if (!wallet || !identityKey) return
    void fulfillTransfers(wallet).then(() => refreshHeld(wallet))
  }, [wallet, identityKey])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const heldFor = (titleId: string): HeldTitle | undefined => {
    return held.find((item) => item.title.titleId === titleId)
  }

  const runIssue = async (): Promise<void> => {
    setLastAction('issue')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('issue')
    try {
      const result = await issueTitle(session.wallet, url, session.identityKey, {
        label,
        document,
        priceSats
      })
      setStatus(result.overlayError
        ? `Issued. Overlay submit failed: ${result.overlayError}`
        : 'Issued.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setDocument('')
        setLabel('')
      }
      await refreshHeld(session.wallet)
      await refresh()
    } catch (err) {
      console.error('Issue failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runTransfer = async (row: OverlayTitle): Promise<void> => {
    setLastAction('transfer')
    setLastTitleId(row.titleId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (transferOpen !== row.titleId) {
      setTransferOpen(row.titleId)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    if (!isHolder(row, session.identityKey)) {
      setActionError(NOT_HOLDER)
      return
    }
    const mine = heldFor(row.titleId) ?? (await refreshHeld(session.wallet)).find((item) => item.title.titleId === row.titleId)
    if (!mine) {
      setActionError('This wallet does not hold that title yet.')
      return
    }
    setBusy('transfer')
    try {
      const result = await transferTitle(
        session.wallet,
        url,
        session.identityKey,
        mine,
        toById[row.titleId] ?? ''
      )
      setStatus(result.overlayError
        ? `Transferred. Overlay submit failed: ${result.overlayError}`
        : 'Transferred.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setTransferOpen(null)
        setToById((current) => ({ ...current, [row.titleId]: '' }))
      }
      await refreshHeld(session.wallet)
      await refresh()
    } catch (err) {
      console.error('Transfer failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runExport = async (row: OverlayTitle): Promise<void> => {
    setLastAction('export')
    setLastTitleId(row.titleId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    if (!isHolder(row, session.identityKey)) {
      setActionError(NOT_HOLDER)
      return
    }
    setBusy('export')
    try {
      const mine = heldFor(row.titleId) ?? (await refreshHeld(session.wallet)).find((item) => item.title.titleId === row.titleId) ?? null
      const result = await exportTitle(session.wallet, url, session.identityKey, row, mine)
      downloadReading(result.reading)
      setReading(result.reading)
      setStatus(result.overlayError
        ? `${EXPORTED} Overlay submit failed: ${result.overlayError}`
        : EXPORTED)
      if (result.overlayError) setActionError(result.overlayError)
    } catch (err) {
      console.error('Export failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'transfer') {
      const row = rows.find((item) => item.titleId === lastTitleId)
      if (row) void runTransfer(row)
      return
    }
    if (lastAction === 'export') {
      const row = rows.find((item) => item.titleId === lastTitleId)
      if (row) void runExport(row)
      return
    }
    void runIssue()
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
            <h2>{LIST_HEADING}</h2>
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
                  <h3>{row.label}</h3>
                  <p className="job">{HELD_BY} {holderFaceName(names[row.holder])}</p>
                  {transferOpen === row.titleId && (
                    <div className="field">
                      <label htmlFor={`to-${row.titleId}`}>{TO_LABEL}</label>
                      <input
                        id={`to-${row.titleId}`}
                        value={toById[row.titleId] ?? ''}
                        onChange={(event) => setToById((current) => ({
                          ...current,
                          [row.titleId]: event.target.value
                        }))}
                        placeholder="Name or account"
                      />
                    </div>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy !== null || connecting || overlayDown}
                      onClick={() => void runTransfer(row)}
                    >
                      {busy === 'transfer' && lastTitleId === row.titleId ? 'Transferring…' : TRANSFER_BUTTON}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy !== null || connecting || overlayDown}
                      onClick={() => void runExport(row)}
                    >
                      {busy === 'export' && lastTitleId === row.titleId ? 'Exporting…' : EXPORT_BUTTON}
                    </button>
                  </div>
                  <details className="advanced">
                    <summary>Advanced</summary>
                    <p>Document hash <code>{shortKey(row.docHash)}</code></p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {reading && (
          <section className="receipt">
            <h2>Reading</h2>
            <p className="facts">
              {reading.label}
              <br />
              {EXPORTED}
            </p>
            {reading.dump && <pre className="dump">{reading.dump}</pre>}
            <details className="advanced">
              <summary>Advanced</summary>
              <p>Document hash <code>{shortKey(reading.docHash)}</code></p>
            </details>
          </section>
        )}

        <section className="block">
          <h2>{ISSUE_HEADING}</h2>
          <p className="job">{ISSUE_JOB}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Dawn lot 12"
              />
            </div>
            <div className="field">
              <label htmlFor="document">Document</label>
              <textarea
                id="document"
                rows={5}
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                placeholder="Paste the document, or a 64-character hash"
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
              <label htmlFor="hash">Document hash</label>
              <input
                id="hash"
                value={hashPreview ? shortKey(hashPreview) : ''}
                readOnly
                placeholder="Fills from the document"
              />
            </details>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null || connecting || overlayDown || !label.trim() || !document.trim()}
              onClick={() => void runIssue()}
            >
              {busy === 'issue' ? 'Issuing…' : ISSUE_BUTTON}
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
