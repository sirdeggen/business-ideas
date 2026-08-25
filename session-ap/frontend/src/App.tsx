import { useEffect, useMemo, useState } from 'react'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  approveSession,
  closeBooks,
  paySession,
  recordSpendStub
} from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DECLINED_SPEND,
  DESKTOP_INSTALL_URL,
  defaultDueDate,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { bookCsv, bookJson, downloadText } from './lib/export'
import {
  fetchUsdPerBsv,
  formatUsd,
  lineUsdTotal,
  moneyActionLabel,
  preferOnScreenAmount,
  resolveSpend,
  tryParseUsdAmount
} from './lib/money'
import { lookupSession } from './lib/overlay'
import {
  cacheBook,
  keepLastGoodBooks,
  readCachedBook,
  readCachedBooks,
  readDrafts,
  removeDraft,
  upsertDraft
} from './lib/persist'
import {
  lineItemFromReceipt,
  openDraft,
  rolledUpTotal,
  type JoinedSession,
  type LineItem,
  type SessionInvoice,
  type SessionStatus
} from './lib/protocol'
import { goHome, goToSession, sessionIdFromUrl, sessionShareUrl } from './lib/route'

function statusLabel(status: SessionStatus): string {
  if (status === 'open') return 'Open'
  if (status === 'closed') return 'Closed'
  if (status === 'approved') return 'Approved'
  return 'Paid'
}

function statusClass(status: SessionStatus): string {
  return `status-word ${status}`
}

function overlayRef(book: SessionInvoice | JoinedSession, fallbackTxid: string): { txid: string, outputIndex: number } {
  if ('txid' in book && typeof book.txid === 'string' && book.txid) {
    return { txid: book.txid, outputIndex: book.outputIndex }
  }
  return { txid: fallbackTxid, outputIndex: 0 }
}

function BookLines({ lines }: { lines: LineItem[] }) {
  if (lines.length === 0) {
    return <p className="empty">No lines yet.</p>
  }
  return (
    <ul className="lines">
      {lines.map((line, index) => (
        <li key={`${line.receiptHash}-${index}`}>
          <div className="line-head">
            <p className="line-label">{line.label}</p>
            <p className="line-amount">{line.amountUsd ? formatUsd(line.amountUsd) : `${line.amountSats.toLocaleString('en-US')} billed`}</p>
          </div>
          <p className="line-hash">{line.receiptHash}</p>
        </li>
      ))}
    </ul>
  )
}

function InstallPrompt({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="install">
      <div className="row">
        <button type="button" className="btn primary" onClick={onRetry}>Retry</button>
        <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
          Install BSV Desktop
        </a>
      </div>
    </div>
  )
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { connecting, error: walletError, walletMissing, connect } = useWallet()

  const [sessionId, setSessionId] = useState(() => sessionIdFromUrl())
  const [drafts, setDrafts] = useState<SessionInvoice[]>(() => readDrafts())
  const [book, setBook] = useState<JoinedSession | SessionInvoice | null>(null)
  const [usedCache, setUsedCache] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [lookupFailed, setLookupFailed] = useState(false)

  const [label, setLabel] = useState('')
  const [payerIdentity, setPayerIdentity] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [lineLabel, setLineLabel] = useState('')
  const [lineUsd, setLineUsd] = useState('')
  const [receipt, setReceipt] = useState('')
  const [attach, setAttach] = useState<'paste' | 'spend'>('paste')
  const [rate, setRate] = useState<number | null>(null)

  const [busy, setBusy] = useState<'open' | 'line' | 'close' | 'approve' | 'pay' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'open' | 'line' | 'close' | 'approve' | 'pay'>('open')

  const working = useMemo(() => {
    if (book) return book
    return drafts.find((row) => row.sessionId === sessionId) ?? null
  }, [book, drafts, sessionId])

  const totalUsd = working ? lineUsdTotal(working.lineItems, rate) : ''
  const totalSats = working ? (working.totalSats || rolledUpTotal(working.lineItems)) : 0
  const liveLine = tryParseUsdAmount(preferOnScreenAmount(lineUsd))
  const liveLineSats = liveLine != null && rate ? resolveSpend(lineUsd, rate).amountSats : undefined
  const payLabel = working
    ? moneyActionLabel('Pay', totalUsd || working.lineItems[0]?.amountUsd || '', totalSats || undefined)
    : 'Pay'
  const sendLabel = liveLine != null
    ? moneyActionLabel('Send', liveLine, liveLineSats)
    : 'Send'

  useEffect(() => {
    void fetchUsdPerBsv()
      .then(setRate)
      .catch(() => setRate(null))
  }, [])

  const refreshBook = async (id = sessionId): Promise<void> => {
    if (!id) {
      setBook(null)
      setUsedCache(false)
      setLookupFailed(false)
      return
    }
    const cached = readCachedBook(id)
    setListBusy(true)
    setLookupFailed(false)
    try {
      const live = await lookupSession(url, id, cached ? [cached.txid, cached.approvalTxid ?? '', cached.paymentTxid ?? ''] : [])
      if (live) {
        cacheBook(live)
        setBook(live)
        setUsedCache(false)
        return
      }
      const kept = keepLastGoodBooks(cached ? [cached] : [], [], true)
      const fallback = kept[0] ?? cached ?? null
      setBook(fallback)
      setUsedCache(Boolean(fallback))
      if (!fallback) setLookupFailed(false)
    } catch (err) {
      console.error('Lookup failed', err)
      const fallback = cached ?? null
      setBook(fallback)
      setUsedCache(Boolean(fallback))
      setLookupFailed(!fallback)
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshBook()
  }, [url, sessionId])

  const ensureWallet = async () => {
    const result = await connect()
    if (!result) return null
    return result
  }

  const runOpen = (): void => {
    setLastAction('open')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      const draft = openDraft({ label, payerIdentity, dueDate })
      setDrafts(upsertDraft(draft))
      setSessionId(draft.sessionId)
      goToSession(draft.sessionId)
      setBook(draft)
      setUsedCache(false)
      setStatus('Session open. Add the small spends, then close the books.')
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  const addPastedLine = (): void => {
    if (!working || working.status !== 'open') return
    setLastAction('line')
    setActionError(null)
    setStatus(null)
    try {
      if (rate == null) throw new Error('Could not fetch a dollar rate')
      const spend = resolveSpend(lineUsd, rate)
      const line = lineItemFromReceipt({
        label: lineLabel,
        amountSats: spend.amountSats,
        amountUsd: spend.amountUsd,
        receipt
      })
      const next = { ...working, lineItems: [...working.lineItems, line], totalSats: rolledUpTotal([...working.lineItems, line]) }
      setDrafts(upsertDraft(next))
      setBook(next)
      setLineLabel('')
      setLineUsd('')
      setReceipt('')
      setStatus('Line added.')
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  const runSpendStub = async (): Promise<void> => {
    if (!working || working.status !== 'open') return
    setLastAction('line')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('line')
    try {
      if (rate == null) throw new Error('Could not fetch a dollar rate')
      const spend = resolveSpend(lineUsd, rate)
      const line = await recordSpendStub(session.wallet, {
        label: lineLabel,
        amountSats: spend.amountSats,
        amountUsd: spend.amountUsd
      })
      const next = { ...working, lineItems: [...working.lineItems, line], totalSats: rolledUpTotal([...working.lineItems, line]) }
      setDrafts(upsertDraft(next))
      setBook(next)
      setLineLabel('')
      setLineUsd('')
      setStatus('Spend recorded and hashed into this session.')
    } catch (err) {
      console.error('Spend stub failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runClose = async (): Promise<void> => {
    if (!working || working.status !== 'open') return
    setLastAction('close')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('close')
    try {
      const result = await closeBooks(session.wallet, url, session.identityKey, working)
      const published: JoinedSession = {
        ...result.book,
        txid: result.txid,
        outputIndex: 0
      }
      cacheBook(published)
      setDrafts(removeDraft(working.sessionId))
      setBook(published)
      setUsedCache(false)
      goToSession(published.sessionId)
      setStatus('Books closed. Copy the treasurer link.')
    } catch (err) {
      console.error('Close failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runApprove = async (): Promise<void> => {
    if (!working) return
    setLastAction('approve')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('approve')
    try {
      const result = await approveSession(session.wallet, url, session.identityKey, working)
      const next: JoinedSession = {
        ...(working as JoinedSession),
        ...result.book,
        approvalTxid: result.txid,
        ...overlayRef(working, result.txid)
      }
      cacheBook(next)
      setBook(next)
      setUsedCache(false)
      setStatus('Approved.')
    } catch (err) {
      console.error('Approve failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runPay = async (): Promise<void> => {
    if (!working) return
    setLastAction('pay')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('pay')
    try {
      const result = await paySession(session.wallet, url, session.identityKey, working)
      const next: JoinedSession = {
        ...(working as JoinedSession),
        ...result.book,
        paymentTxid: result.txid,
        ...overlayRef(working, result.txid)
      }
      cacheBook(next)
      setBook(next)
      setUsedCache(false)
      setStatus('Paid.')
    } catch (err) {
      console.error('Pay failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'line') {
      if (attach === 'spend') void runSpendStub()
      else addPastedLine()
    } else if (lastAction === 'close') void runClose()
    else if (lastAction === 'approve') void runApprove()
    else if (lastAction === 'pay') void runPay()
    else runOpen()
  }

  const copyLink = async (): Promise<void> => {
    if (!working) return
    await navigator.clipboard.writeText(sessionShareUrl(working.sessionId))
    setStatus('Treasurer link copied.')
  }

  const exportJson = (): void => {
    if (!working) return
    downloadText(`${working.label || 'session'}.json`, bookJson(working), 'application/json')
  }

  const exportCsv = (): void => {
    if (!working) return
    downloadText(`${working.label || 'session'}.csv`, bookCsv(working), 'text/csv')
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall
  const isInvoice = Boolean(sessionId)
  const showEmpty = isInvoice && !working && !listBusy && !usedCache
  const lastGoodDesk = keepLastGoodBooks(readCachedBooks(), [], false)

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">Session AP</p>
          <h1>{working?.label || (isInvoice ? 'This session' : 'Close this session.')}</h1>
          <p className="lede">Many small spends. One invoice to approve.</p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}
        {usedCache && working && (
          <p className="helper">Showing last-good book.</p>
        )}
        {listBusy && isInvoice && !working && (
          <p className="helper">Looking up this session…</p>
        )}

        {!isInvoice && (
          <section className="block">
            <p className="job">Open a session, attach the small spends, then close the books for the treasurer.</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="label">Session</label>
                <input
                  id="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="March crawls"
                />
              </div>
              <div className="field">
                <label htmlFor="payer">Payer</label>
                <input
                  id="payer"
                  value={payerIdentity}
                  onChange={(event) => setPayerIdentity(event.target.value)}
                  placeholder="Their account"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="due">Due</label>
                <input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn primary" disabled={busy !== null} onClick={runOpen}>
                Open session
              </button>
            </div>
            {lastGoodDesk.length > 0 && (
              <ul className="desk-list">
                {lastGoodDesk.map((row) => (
                  <li key={row.sessionId}>
                    <a href={sessionShareUrl(row.sessionId)}>{row.label}</a>
                    <span className={statusClass(row.status)}> {statusLabel(row.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {showEmpty && (
          <p className="empty">
            {lookupFailed
              ? 'Couldn’t refresh this session.'
              : 'No session in this link.'}
          </p>
        )}

        {working && (
          <section className="slip">
            <p className={statusClass(working.status)}>{statusLabel(working.status)}</p>
            {totalUsd && <p className="amount-xl">{totalUsd}</p>}
            <dl className="facts">
              <dt>Payer</dt>
              <dd>{shortKey(working.payerIdentity)}</dd>
              {working.payeeIdentity && (
                <>
                  <dt>Vendor</dt>
                  <dd>{shortKey(working.payeeIdentity)}</dd>
                </>
              )}
              <dt>Due</dt>
              <dd>{working.dueDate}</dd>
              <dt>Lines</dt>
              <dd>{working.lineItems.length}</dd>
            </dl>
            <BookLines lines={working.lineItems} />

            {working.status === 'open' && (
              <div className="fields" style={{ marginTop: 24 }}>
                <div className="attach" role="tablist">
                  <button type="button" className={attach === 'paste' ? 'active' : ''} onClick={() => setAttach('paste')}>
                    Paste a receipt
                  </button>
                  <button type="button" className={attach === 'spend' ? 'active' : ''} onClick={() => setAttach('spend')}>
                    Record a spend
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="lineLabel">Line</label>
                  <input
                    id="lineLabel"
                    value={lineLabel}
                    onChange={(event) => setLineLabel(event.target.value)}
                    placeholder="Article fetch"
                  />
                </div>
                <div className="field">
                  <label htmlFor="lineUsd">Amount</label>
                  <div className="dollar">
                    <span>$</span>
                    <input
                      id="lineUsd"
                      value={lineUsd}
                      onChange={(event) => setLineUsd(event.target.value)}
                      placeholder="0.60"
                      inputMode="decimal"
                    />
                  </div>
                </div>
                {attach === 'paste' && (
                  <div className="field">
                    <label htmlFor="receipt">Receipt</label>
                    <textarea
                      id="receipt"
                      value={receipt}
                      onChange={(event) => setReceipt(event.target.value)}
                      placeholder="Paste a receipt or transaction id"
                    />
                  </div>
                )}
                <div className="actions">
                  {attach === 'paste' ? (
                    <button type="button" className="btn" disabled={busy !== null} onClick={addPastedLine}>
                      Add line
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy !== null || connecting}
                      onClick={() => void runSpendStub()}
                    >
                      {busy === 'line' ? 'Sending…' : sendLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting || working.lineItems.length === 0}
                    onClick={() => void runClose()}
                  >
                    {busy === 'close' ? 'Closing…' : 'Close the books'}
                  </button>
                </div>
              </div>
            )}

            {working.status !== 'open' && (
              <div className="actions">
                {working.status === 'closed' && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting}
                    onClick={() => void runApprove()}
                  >
                    {busy === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                )}
                {working.status === 'approved' && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting}
                    onClick={() => void runPay()}
                  >
                    {busy === 'pay' ? 'Paying…' : payLabel}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  Copy treasurer link
                </button>
                <button type="button" className="btn" onClick={exportJson}>Export JSON</button>
                <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSessionId('')
                    setBook(null)
                    goHome()
                  }}
                >
                  Desk
                </button>
              </div>
            )}
          </section>
        )}

        {status && <p className="status ok">{status}</p>}
        {combinedError && <p className="status err">{combinedError}</p>}
        {combinedError === DECLINED_SPEND && (
          <p className="helper">{DECLINED_SPEND}</p>
        )}
      </article>

      {showInstall && <InstallPrompt onRetry={retry} />}
      {combinedError === CHROME_ALLOW_HINT && (
        <p className="helper">{CHROME_ALLOW_HINT}</p>
      )}

      <details className="advanced">
        <summary>Overlay URL</summary>
        <p>Operators can point this at another indexer. Public default is overlay-us-1.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
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
