import { useEffect, useState } from 'react'
import type { FeedSub, MetricType } from '../../protocol/feed'
import { METRIC_TYPES } from '../../protocol/feed'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanPublish,
  assertCanUpdate,
  fulfillQueries,
  parseWhole,
  postFeed,
  postReading,
  queryFeed,
  subscribeFeed,
  type ReadingReceipt
} from './lib/actions'
import {
  AMOUNTS_LINE,
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  INCLUDED_LINE,
  LEDE,
  LIST_HEADING,
  PAID_LINE,
  PAID_WAIT,
  POST_BUTTON,
  POST_HEADING,
  POST_JOB,
  POSTING_BUTTON,
  PUBLISHED_STATUS,
  PUBLISHING_BUTTON,
  QUERY_BUTTON,
  QUERYING_BUTTON,
  RECEIPT_HEADING,
  STRANGER_LINE,
  SUB_WAIT,
  SUBSCRIBE_BUTTON,
  SUBSCRIBING_BUTTON,
  TITLE,
  UPDATE_BUTTON,
  UPDATE_HEADING,
  UPDATE_JOB,
  UPDATED_STATUS,
  formatPrice,
  formatWhen,
  metricLabel,
  valueLine
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupDesk, type FeedRow } from './lib/overlay'

interface ShownReceipt {
  label: string
  valueLine: string
  covered: boolean
  payTxid: string
  valueHash: string
  publisher: string
}

type Busy = 'publish' | 'update' | 'query' | 'subscribe' | null

function showReceipt(result: ReadingReceipt): ShownReceipt | null {
  if (result.waiting || !result.value) return null
  return {
    label: result.label,
    valueLine: valueLine(result.value, result.unit),
    covered: result.covered,
    payTxid: result.payTxid,
    valueHash: result.valueHash,
    publisher: result.publisher
  }
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<FeedRow[]>([])
  const [subs, setSubs] = useState<FeedSub[]>([])
  const [localSubs, setLocalSubs] = useState<FeedSub[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [metricType, setMetricType] = useState<MetricType>('price')
  const [unit, setUnit] = useState('')
  const [reading, setReading] = useState('')
  const [price, setPrice] = useState('1000')
  const [subscription, setSubscription] = useState('')
  const [hours, setHours] = useState('24')
  const [feedId, setFeedId] = useState('')
  const [nextReading, setNextReading] = useState('')

  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Busy>('publish')
  const [lastFeedId, setLastFeedId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ShownReceipt | null>(null)

  const overlayDown = online === false
  const knownSubs = [...subs, ...localSubs]

  const refresh = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      const desk = await lookupDesk(url)
      setRows(desk.feeds)
      setSubs(desk.subs)
      setFeedId((current) => current || desk.feeds[0]?.feed.feedId || '')
    } catch (err) {
      console.error('Lookup failed', err)
      setRows([])
      setSubs([])
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
    void fulfillQueries(wallet)
  }, [wallet, identityKey])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const fail = (err: unknown): void => {
    console.error(err)
    setActionError(errorMessage(err))
    setActionNeedsInstall(isWalletMissing(err))
  }

  const runPublish = async (): Promise<void> => {
    setLastAction('publish')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const queryPriceSats = parseWhole(price)
    const subPriceSats = subscription.trim() ? parseWhole(subscription) : 0
    const subHours = parseWhole(hours) ?? 0
    try {
      assertCanPublish({
        label,
        metricType,
        unit,
        value: reading,
        queryPriceSats: queryPriceSats ?? 0,
        subPriceSats: subPriceSats ?? -1,
        subHours
      })
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('publish')
    try {
      const result = await postFeed(session.wallet, url, session.identityKey, {
        label,
        metricType,
        unit,
        value: reading,
        queryPriceSats: queryPriceSats ?? 0,
        subPriceSats: subPriceSats ?? 0,
        subHours
      })
      setStatus(result.overlayError
        ? `${PUBLISHED_STATUS} Overlay submit failed: ${result.overlayError}`
        : PUBLISHED_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      else setReading('')
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runUpdate = async (): Promise<void> => {
    setLastAction('update')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const row = rows.find((item) => item.feed.feedId === feedId)
    try {
      if (!row) throw new Error('Pick a feed.')
      assertCanUpdate(nextReading)
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session || !row) return
    setBusy('update')
    try {
      const result = await postReading(session.wallet, url, session.identityKey, row, {
        value: nextReading
      })
      setStatus(result.overlayError
        ? `${UPDATED_STATUS} Overlay submit failed: ${result.overlayError}`
        : UPDATED_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      else setNextReading('')
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runQuery = async (row: FeedRow): Promise<void> => {
    setLastAction('query')
    setLastFeedId(row.feed.feedId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('query')
    try {
      const result = await queryFeed(session.wallet, url, session.identityKey, row, knownSubs)
      const shown = showReceipt(result)
      setReceipt(shown)
      setStatus(shown ? null : (result.covered ? SUB_WAIT : PAID_WAIT))
      if (result.overlayError) setActionError(result.overlayError)
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runSubscribe = async (row: FeedRow): Promise<void> => {
    setLastAction('subscribe')
    setLastFeedId(row.feed.feedId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('subscribe')
    try {
      const result = await subscribeFeed(session.wallet, url, session.identityKey, row)
      setLocalSubs((current) => [...current, result.sub])
      const shown = showReceipt(result.receipt)
      setReceipt(shown)
      setStatus(shown ? null : SUB_WAIT)
      if (result.receipt.overlayError) setActionError(result.receipt.overlayError)
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'query' || lastAction === 'subscribe') {
      const row = rows.find((item) => item.feed.feedId === lastFeedId)
      if (!row) return
      if (lastAction === 'subscribe') void runSubscribe(row)
      else void runQuery(row)
      return
    }
    if (lastAction === 'update') {
      void runUpdate()
      return
    }
    void runPublish()
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall

  return (
    <div className="booth">
      <div className="scene-crop hero">
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A colleague handing over a fresh signed reading at a night data desk."
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="glass">
          <header className="glass-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{TITLE}</h1>
            <p className="lede">{LEDE}</p>
          </header>

          <BusinessCase />

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          <section className="block">
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
                  <li key={row.feed.feedId} className="listing">
                    <h3>{row.feed.label}</h3>
                    <dl className="meta">
                      <div>
                        <dt>Type</dt>
                        <dd>{metricLabel(row.feed.metricType)}</dd>
                      </div>
                      <div>
                        <dt>Price</dt>
                        <dd className="price">{formatPrice(row.feed.queryPriceSats)}</dd>
                      </div>
                      {row.feed.subPriceSats > 0 && (
                        <div>
                          <dt>Subscription</dt>
                          <dd className="price">{formatPrice(row.feed.subPriceSats)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatWhen(row.updatedAt)}</dd>
                      </div>
                    </dl>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy !== null || connecting || overlayDown}
                        onClick={() => void runQuery(row)}
                      >
                        {busy === 'query' && lastFeedId === row.feed.feedId ? QUERYING_BUTTON : QUERY_BUTTON}
                      </button>
                      {row.feed.subPriceSats > 0 && (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy !== null || connecting || overlayDown}
                          onClick={() => void runSubscribe(row)}
                        >
                          {busy === 'subscribe' && lastFeedId === row.feed.feedId ? SUBSCRIBING_BUTTON : SUBSCRIBE_BUTTON}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="helper">{STRANGER_LINE}</p>
          </section>

          {receipt && (
            <section className="receipt">
              <h2>{RECEIPT_HEADING}</h2>
              <p className="facts">
                {receipt.label}
                <br />
                <span className="reading">{receipt.valueLine}</span>
                <br />
                {receipt.covered ? INCLUDED_LINE : PAID_LINE}
              </p>
            </section>
          )}

          <section className="slip">
            <h2>{POST_HEADING}</h2>
            <p className="job">{POST_JOB}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="label">Label</label>
                <input
                  id="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Gold spot"
                  maxLength={80}
                />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="type">Type</label>
                  <select
                    id="type"
                    value={metricType}
                    onChange={(event) => setMetricType(event.target.value as MetricType)}
                  >
                    {METRIC_TYPES.map((type) => (
                      <option key={type} value={type}>{metricLabel(type)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="unit">Unit</label>
                  <input
                    id="unit"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                    placeholder="USD/oz"
                    maxLength={24}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="reading">Reading</label>
                <input
                  id="reading"
                  value={reading}
                  onChange={(event) => setReading(event.target.value)}
                  placeholder="2431.50"
                  maxLength={80}
                />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="price">Price</label>
                  <input
                    id="price"
                    inputMode="numeric"
                    className="price"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="subscription">Subscription</label>
                  <input
                    id="subscription"
                    inputMode="numeric"
                    className="price"
                    value={subscription}
                    onChange={(event) => setSubscription(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown || !label.trim() || !reading.trim()}
                onClick={() => void runPublish()}
              >
                {busy === 'publish' ? PUBLISHING_BUTTON : POST_BUTTON}
              </button>
            </div>
          </section>

          {rows.length > 0 && (
            <section className="slip">
              <h2>{UPDATE_HEADING}</h2>
              <p className="job">{UPDATE_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="feed">Feed</label>
                  <select
                    id="feed"
                    value={feedId}
                    onChange={(event) => setFeedId(event.target.value)}
                  >
                    {rows.map((row) => (
                      <option key={row.feed.feedId} value={row.feed.feedId}>{row.feed.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="next-reading">Reading</label>
                  <input
                    id="next-reading"
                    value={nextReading}
                    onChange={(event) => setNextReading(event.target.value)}
                    placeholder="2432.10"
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown || !nextReading.trim()}
                  onClick={() => void runUpdate()}
                >
                  {busy === 'update' ? POSTING_BUTTON : UPDATE_BUTTON}
                </button>
              </div>
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
          <p>{AMOUNTS_LINE}</p>
          <label htmlFor="hours">Hours</label>
          <input
            id="hours"
            inputMode="numeric"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          <p>Subscription length when a subscription price is set. Query and subscription amounts are whole sats.</p>
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {receipt && (
            <>
              <p>
                Reading hash <code>{shortKey(receipt.valueHash)}</code>
              </p>
              <p>
                Publisher key <code>{shortKey(receipt.publisher, 8)}</code>
              </p>
              {receipt.payTxid && (
                <p>
                  Transaction <code>{shortKey(receipt.payTxid)}</code>
                </p>
              )}
            </>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer.</p>
        </details>

        <p className="fine-print">{FOOTER}</p>
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
