import { useEffect, useRef, useState } from 'react'
import type { InferencePack, InferenceUsage } from '../../protocol/inference'
import {
  demoOffer,
  demoPack,
  isDemoOffer,
  meterRemaining,
  receiptsForPack,
  verifyReceiptChain,
  verifyUsage
} from '../../protocol/inference'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanList,
  assertCanPrompt,
  buyPack,
  listOffer,
  packBalance,
  parseWhole,
  payPerCall,
  previewUsage,
  usePack
} from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  LISTING_BUTTON,
  LIST_HEADING,
  LISTED_STATUS,
  METER_HEADING,
  PACK_BUTTON,
  PACKING_BUTTON,
  PACK_STATUS,
  PAID_LINE,
  PAID_STATUS,
  PAYING_BUTTON,
  PAY_BUTTON,
  POST_BUTTON,
  POST_HEADING,
  POST_JOB,
  PREVIEW_LINE,
  RECEIPT_HEADING,
  RUNNING_BUTTON,
  RUN_BUTTON,
  STRANGER_LINE,
  TITLE,
  TRY_HEADING,
  TRY_JOB,
  USE_BUTTON,
  USING_BUTTON,
  VERIFIED_LINE,
  VERIFY_BUTTON,
  AMOUNTS_LINE,
  formatPrice,
  formatWhen
} from './lib/copy'
import { lookupDesk, type OfferRow, type OverlayPack } from './lib/overlay'
import { goToOffer, readOfferFromLocation } from './lib/route'

interface PreviewRow {
  usage: InferenceUsage
  response: string
}

interface ShownReceipt {
  response: string
  usage: InferenceUsage
  paid: boolean
  txid: string
  previous: InferenceUsage | null
  pack: InferencePack | null
}

type Busy = 'list' | 'pay' | 'pack' | 'use' | 'run' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<OfferRow[]>([])
  const [packs, setPacks] = useState<OverlayPack[]>([])
  const [usages, setUsages] = useState<InferenceUsage[]>([])
  const [localPacks, setLocalPacks] = useState<OverlayPack[]>([])
  const [localUsages, setLocalUsages] = useState<InferenceUsage[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [model, setModel] = useState('')
  const [price, setPrice] = useState('1000')
  const [packPrice, setPackPrice] = useState('')
  const [packCalls, setPackCalls] = useState('5')
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)

  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [verifyNote, setVerifyNote] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Busy>('list')
  const [lastOfferId, setLastOfferId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ShownReceipt | null>(null)

  const installRef = useRef<HTMLDivElement>(null)
  const overlayDown = online === false
  const showInstall = walletMissing || actionNeedsInstall
  const sample = demoPack()
  const previewUsages = preview.map((row) => row.usage)
  const meter = meterRemaining(sample.packTotal, previewUsages)
  const knownPacks = [...packs, ...localPacks]
  const knownUsages = [...usages, ...localUsages]

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    const located = readOfferFromLocation()
    if (located.offerId) setFocusId(located.offerId)
  }, [])

  const refresh = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      const desk = await lookupDesk(url)
      setRows(desk.offers)
      setPacks(desk.packs)
      setUsages(desk.usages)
    } catch (err) {
      console.error('Lookup failed', err)
      setRows([])
      setPacks([])
      setUsages([])
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

  const fail = (err: unknown): void => {
    console.error(err)
    setActionError(errorMessage(err))
    setActionNeedsInstall(isWalletMissing(err))
  }

  const runPreview = (): void => {
    setLastAction('run')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    setVerifyNote(null)
    try {
      assertCanPrompt(prompt)
      const next = previewUsage(demoOffer(), sample, previewUsages, prompt)
      setPreview((current) => [...current, next])
      setReceipt({
        response: next.response,
        usage: next.usage,
        paid: false,
        txid: '',
        previous: previewUsages[previewUsages.length - 1] ?? null,
        pack: sample
      })
      setPrompt('')
    } catch (err) {
      fail(err)
    }
  }

  const runVerify = (): void => {
    setActionError(null)
    setVerifyNote(null)
    if (!receipt) {
      setActionError('Run a call first.')
      return
    }
    if (!receipt.paid) {
      const responses: Record<string, string> = {}
      for (const row of preview) responses[row.usage.responseHash] = row.response
      const error = verifyReceiptChain(sample, previewUsages, responses)
      if (error) {
        setActionError(error)
        return
      }
      setVerifyNote(VERIFIED_LINE)
      return
    }
    const error = verifyUsage({
      response: receipt.response,
      usage: receipt.usage,
      previous: receipt.previous,
      pack: receipt.pack
    })
    if (error) {
      setActionError(error)
      return
    }
    setVerifyNote(VERIFIED_LINE)
  }

  const runList = async (): Promise<void> => {
    setLastAction('list')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const callSats = parseWhole(price)
    const packSats = packPrice.trim() ? parseWhole(packPrice) : 0
    const calls = parseWhole(packCalls) ?? 0
    try {
      assertCanList({
        label,
        model,
        callSats: callSats ?? 0,
        packSats: packSats ?? -1,
        packCalls: calls
      })
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('list')
    try {
      const result = await listOffer(session.wallet, url, session.identityKey, {
        label,
        model,
        callSats: callSats ?? 0,
        packSats: packSats ?? 0,
        packCalls: calls
      })
      setFocusId(result.offerId)
      goToOffer(result.offerId, result.txid)
      setStatus(result.overlayError
        ? `${LISTED_STATUS} Overlay submit failed: ${result.overlayError}`
        : LISTED_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setLabel('')
        setModel('')
      }
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runPay = async (row: OfferRow): Promise<void> => {
    setLastAction('pay')
    setLastOfferId(row.offer.offerId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    setVerifyNote(null)
    try {
      assertCanPrompt(prompt)
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('pay')
    try {
      const result = await payPerCall(session.wallet, url, session.identityKey, row, { prompt })
      setReceipt({
        response: result.response,
        usage: result.usage,
        paid: true,
        txid: result.txid,
        previous: null,
        pack: null
      })
      setLocalUsages((current) => [...current, result.usage])
      goToOffer(row.offer.offerId, result.txid)
      setStatus(result.overlayError
        ? `${PAID_STATUS} Overlay submit failed: ${result.overlayError}`
        : PAID_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      else setPrompt('')
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runBuy = async (row: OfferRow): Promise<void> => {
    setLastAction('pack')
    setLastOfferId(row.offer.offerId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('pack')
    try {
      const result = await buyPack(session.wallet, url, session.identityKey, row)
      setLocalPacks((current) => [...current, { ...result.pack, txid: result.txid, outputIndex: 0 }])
      goToOffer(row.offer.offerId, result.txid)
      setStatus(result.overlayError
        ? `${PACK_STATUS} Overlay submit failed: ${result.overlayError}`
        : PACK_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runUse = async (row: OfferRow): Promise<void> => {
    setLastAction('use')
    setLastOfferId(row.offer.offerId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    setVerifyNote(null)
    try {
      assertCanPrompt(prompt)
    } catch (err) {
      fail(err)
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('use')
    try {
      const open = knownPacks.find((pack) => (
        pack.offerId === row.offer.offerId
        && pack.buyer.toLowerCase() === session.identityKey.toLowerCase()
        && packBalance(pack, knownUsages) >= row.offer.callSats
      ))
      const prior = open ? receiptsForPack(knownUsages, open.packId) : []
      const result = await usePack(
        session.wallet,
        url,
        session.identityKey,
        row,
        knownPacks,
        knownUsages,
        { prompt }
      )
      setReceipt({
        response: result.response,
        usage: result.usage,
        paid: true,
        txid: result.txid,
        previous: prior[prior.length - 1] ?? null,
        pack: open ?? null
      })
      setLocalUsages((current) => [...current, result.usage])
      goToOffer(row.offer.offerId, result.txid)
      setStatus(result.overlayError
        ? `${PAID_STATUS} Overlay submit failed: ${result.overlayError}`
        : PAID_STATUS)
      if (result.overlayError) setActionError(result.overlayError)
      else setPrompt('')
      await refresh()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'run') {
      runPreview()
      return
    }
    if (lastAction === 'pay' || lastAction === 'pack' || lastAction === 'use') {
      const row = rows.find((item) => item.offer.offerId === lastOfferId)
      if (!row) return
      if (lastAction === 'pack') void runBuy(row)
      else if (lastAction === 'use') void runUse(row)
      else void runPay(row)
      return
    }
    void runList()
  }

  const combinedError = actionError || walletError

  return (
    <div className="booth">
      <div className="scene-crop hero">
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A night desk where amber lamps tick down beside one cream card."
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
                {rows.map((row) => {
                  const offerPacks = knownPacks.filter((pack) => pack.offerId === row.offer.offerId)
                  const top = offerPacks[0]
                  const remaining = top ? packBalance(top, knownUsages) : null
                  return (
                    <li
                      key={row.offer.offerId}
                      className={focusId === row.offer.offerId ? 'listing current' : 'listing'}
                    >
                      <h3>{row.offer.label}</h3>
                      <dl className="meta">
                        <div>
                          <dt>Model</dt>
                          <dd>{row.offer.model}</dd>
                        </div>
                        <div>
                          <dt>Price</dt>
                          <dd className="price">{formatPrice(row.offer.callSats)}</dd>
                        </div>
                        {row.offer.packSats > 0 && (
                          <div>
                            <dt>Pack</dt>
                            <dd className="price">{formatPrice(row.offer.packSats)}</dd>
                          </div>
                        )}
                        {remaining !== null && (
                          <div>
                            <dt>{METER_HEADING}</dt>
                            <dd className="price">{formatPrice(remaining)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Listed</dt>
                          <dd>{formatWhen(row.offer.timestamp)}</dd>
                        </div>
                      </dl>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn primary"
                          disabled={busy !== null || connecting || overlayDown || isDemoOffer(row.offer)}
                          onClick={() => void runPay(row)}
                        >
                          {busy === 'pay' && lastOfferId === row.offer.offerId ? PAYING_BUTTON : PAY_BUTTON}
                        </button>
                        {row.offer.packSats > 0 && (
                          <button
                            type="button"
                            className="btn"
                            disabled={busy !== null || connecting || overlayDown || isDemoOffer(row.offer)}
                            onClick={() => void runBuy(row)}
                          >
                            {busy === 'pack' && lastOfferId === row.offer.offerId ? PACKING_BUTTON : PACK_BUTTON}
                          </button>
                        )}
                        {row.offer.packCalls > 0 && (
                          <button
                            type="button"
                            className="btn"
                            disabled={busy !== null || connecting || overlayDown || isDemoOffer(row.offer)}
                            onClick={() => void runUse(row)}
                          >
                            {busy === 'use' && lastOfferId === row.offer.offerId ? USING_BUTTON : USE_BUTTON}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="helper">{STRANGER_LINE}</p>
          </section>

          <section className="slip">
            <h2>{TRY_HEADING}</h2>
            <p className="job">{TRY_JOB}</p>
            <div className="meter-readout">
              <span>{METER_HEADING}</span>
              <strong className="price">{formatPrice(meter)}</strong>
            </div>
            <div className="fields">
              <div className="field">
                <label htmlFor="prompt">Prompt</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Summarize the note"
                  maxLength={480}
                  rows={3}
                />
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null}
                onClick={runPreview}
              >
                {busy === 'run' ? RUNNING_BUTTON : RUN_BUTTON}
              </button>
              <button type="button" className="btn" onClick={runVerify}>
                {VERIFY_BUTTON}
              </button>
            </div>
          </section>

          {receipt && (
            <section className="receipt">
              <h2>{RECEIPT_HEADING}</h2>
              <p className="facts">
                {receipt.response}
                <br />
                <span className="reading">{shortKey(receipt.usage.responseHash, 8)}</span>
                <br />
                {METER_HEADING} {formatPrice(receipt.usage.remaining)}
                <br />
                {receipt.paid ? PAID_LINE : PREVIEW_LINE}
              </p>
              {verifyNote && <p className="status ok">{verifyNote}</p>}
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
                  placeholder="Desk note"
                  maxLength={80}
                />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="model">Model</label>
                  <input
                    id="model"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="desk-note"
                    maxLength={40}
                  />
                </div>
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
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="pack">Pack</label>
                  <input
                    id="pack"
                    inputMode="numeric"
                    className="price"
                    value={packPrice}
                    onChange={(event) => setPackPrice(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="field">
                  <label htmlFor="calls">Calls</label>
                  <input
                    id="calls"
                    inputMode="numeric"
                    value={packCalls}
                    onChange={(event) => setPackCalls(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown}
                onClick={() => void runList()}
              >
                {busy === 'list' ? LISTING_BUTTON : POST_BUTTON}
              </button>
            </div>
          </section>

          {status && <p className="status ok">{status}</p>}
          {combinedError && <p className="status err">{combinedError}</p>}
        </article>

        {showInstall && (
          <div className="install" ref={installRef}>
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
          <p>Query prices, pack prices, and meter balances are whole sats. The preview meter is local until you pay.</p>
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {receipt && (
            <>
              <p>
                Response hash <code>{receipt.usage.responseHash}</code>
              </p>
              <p>
                Attestation <code>{shortKey(receipt.usage.attestation)}</code>
              </p>
              {receipt.txid && (
                <p>
                  Transaction <code>{shortKey(receipt.txid)}</code>
                </p>
              )}
            </>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer. Topic stays the public any-tx rail.</p>
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
