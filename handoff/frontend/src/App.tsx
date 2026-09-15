import { useEffect, useMemo, useState } from 'react'
import {
  ASSET_TYPES,
  DEFAULT_ASSET_TYPE,
  DEFAULT_DESCRIPTION,
  DEFAULT_PRICE_SATS,
  DEFAULT_TITLE,
  canConfirm,
  canFund,
  canRelease,
  isBuyer,
  isSeller,
  type AssetType
} from '../../protocol/handoff'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanList,
  confirmHandoff,
  fundEscrow,
  listAsset,
  releaseHandoff
} from './lib/actions'
import {
  CONFIRM_BUTTON,
  CONFIRM_JOB,
  CONFIRMING_BUTTON,
  EMPTY_LIST,
  EYEBROW,
  FEE_STORY,
  FOOTER,
  FUND_BUTTON,
  FUND_JOB,
  FUNDING_BUTTON,
  LEDE,
  LIST_BUTTON,
  LIST_HEADING,
  LIST_JOB,
  LISTING_BUTTON,
  RELEASE_BUTTON,
  RELEASE_JOB,
  RELEASING_BUTTON,
  STRANGER_LINE,
  TITLE,
  formatPrice,
  formatWhen,
  stampFor,
  typeLabel
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { buyerLine, displayNameFor, sellerLine } from './lib/identity'
import { lookupListing, lookupListings, type ListingView } from './lib/overlay'
import { goHome, goToListing, listingPublicUrl, readListingFromLocation } from './lib/route'

type Busy = 'list' | 'fund' | 'confirm' | 'release' | null

function stampClass(status: ListingView['status']): string {
  if (status === 'released') return 'released'
  if (status === 'confirmed') return 'confirmed'
  if (status === 'funded' || status === 'seller_confirmed' || status === 'buyer_confirmed') return 'funded'
  return 'listed'
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const initial = useMemo(() => readListingFromLocation(), [])
  const [listingId, setListingId] = useState(initial.listingId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [rows, setRows] = useState<ListingView[]>([])
  const [view, setView] = useState<ListingView | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [assetType, setAssetType] = useState<AssetType>(DEFAULT_ASSET_TYPE)
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION)
  const [price, setPrice] = useState(String(DEFAULT_PRICE_SATS))

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<Exclude<Busy, null>>('list')
  const [copied, setCopied] = useState(false)

  const overlayDown = online === false
  const selected = view?.list ? view : null

  const rememberNames = (keys: string[]): void => {
    const unique = [...new Set(keys.filter(Boolean))]
    void Promise.all(unique.map(async (key) => {
      const name = await displayNameFor(key)
      if (name) setNames((current) => ({ ...current, [key]: name }))
    }))
  }

  const refreshList = async (): Promise<void> => {
    setListBusy(true)
    setLookupError(null)
    try {
      const next = await lookupListings(url)
      setRows(next)
      rememberNames(next.flatMap((row) => [
        row.list?.sellerIdentity ?? '',
        row.fund?.buyerIdentity ?? ''
      ]))
    } catch {
      setRows([])
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  const refreshSelected = async (id = listingId, txid = hintTxid): Promise<void> => {
    if (!id) {
      setView(null)
      return
    }
    setListBusy(true)
    try {
      const next = await lookupListing(url, id, txid || undefined)
      setView(next)
      setLookupError(next.list ? null : 'This listing wasn’t found.')
      if (next.list) {
        rememberNames([next.list.sellerIdentity, next.fund?.buyerIdentity ?? ''])
      }
    } catch {
      setView(null)
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refreshList()
  }, [url])

  useEffect(() => {
    void refreshSelected()
  }, [url, listingId, hintTxid])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const openListing = (id: string, txid?: string): void => {
    setListingId(id)
    setHintTxid(txid ?? '')
    goToListing(id, txid)
  }

  const backHome = (): void => {
    setListingId('')
    setHintTxid('')
    setView(null)
    setLookupError(null)
    goHome()
  }

  const runList = async (): Promise<void> => {
    setLastAction('list')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    let priceSats: number
    try {
      priceSats = Number(price.replace(/,/g, ''))
      assertCanList({ title, assetType, description, priceSats })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('list')
    try {
      const result = await listAsset(session.wallet, url, session.identityKey, {
        title,
        assetType,
        description,
        priceSats
      })
      setListingId(result.listingId)
      setHintTxid(result.txid)
      goToListing(result.listingId, result.txid)
      setNotice(result.overlayError
        ? `Listed. Overlay submit failed: ${result.overlayError}`
        : 'Listed. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.listingId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('List asset failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runFund = async (): Promise<void> => {
    setLastAction('fund')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.list) {
      setActionError('This listing wasn’t found.')
      return
    }
    if (identityKey && isSeller(selected.list, identityKey)) return
    const session = await ensureWallet()
    if (!session) return
    if (isSeller(selected.list, session.identityKey)) return
    setBusy('fund')
    try {
      const result = await fundEscrow(session.wallet, url, session.identityKey, selected.list)
      setHintTxid(result.txid)
      goToListing(result.listingId, result.txid)
      setNotice(result.overlayError
        ? `Funded. Overlay submit failed: ${result.overlayError}`
        : 'Funded. Waiting for confirmation.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.listingId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Fund escrow failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runConfirm = async (): Promise<void> => {
    setLastAction('confirm')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.list) {
      setActionError('This listing wasn’t found.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('confirm')
    try {
      const result = await confirmHandoff(session.wallet, url, session.identityKey, selected.list)
      setHintTxid(result.txid)
      goToListing(result.listingId, result.txid)
      setNotice(result.overlayError
        ? `Confirmed. Overlay submit failed: ${result.overlayError}`
        : 'Confirmed.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.listingId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Confirm handoff failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runRelease = async (): Promise<void> => {
    setLastAction('release')
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    if (!selected?.list) {
      setActionError('This listing wasn’t found.')
      return
    }
    if (identityKey && selected.fund && !isBuyer(selected.fund, identityKey)) return
    const session = await ensureWallet()
    if (!session) return
    if (selected.fund && !isBuyer(selected.fund, session.identityKey)) return
    setBusy('release')
    try {
      const result = await releaseHandoff(session.wallet, url, session.identityKey, selected.list)
      setHintTxid(result.txid)
      goToListing(result.listingId, result.txid)
      setNotice(result.overlayError
        ? `Released. Overlay submit failed: ${result.overlayError}`
        : 'Released. Handoff receipt is on the book.')
      if (result.overlayError) setActionError(result.overlayError)
      await refreshSelected(result.listingId, result.txid)
      await refreshList()
    } catch (err) {
      console.error('Release handoff failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'fund') void runFund()
    else if (lastAction === 'confirm') void runConfirm()
    else if (lastAction === 'release') void runRelease()
    else void runList()
  }

  const copyLink = async (): Promise<void> => {
    const id = selected?.listingId || listingId
    if (!id) return
    await navigator.clipboard.writeText(listingPublicUrl(id, hintTxid || selected?.list?.txid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const showFund = (row: ListingView): boolean => {
    if (!canFund(row.status)) return false
    if (!identityKey) return true
    return Boolean(row.list && !isSeller(row.list, identityKey))
  }

  const showConfirm = (row: ListingView): boolean => {
    if (!canConfirm(row.status)) return false
    if (!identityKey) return true
    if (row.list && isSeller(row.list, identityKey) && !row.sellerConfirm) return true
    if (row.fund && isBuyer(row.fund, identityKey) && !row.buyerConfirm) return true
    return false
  }

  const showRelease = (row: ListingView): boolean => {
    if (!canRelease(row.status)) return false
    if (!identityKey) return true
    return Boolean(row.fund && isBuyer(row.fund, identityKey))
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall

  return (
    <div className="studio">
      <div className={`scene-crop ${selected ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A studio associate handing over a digital ownership key."
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

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!listingId && (
            <section className="slip">
              <div className="section-head">
                <h2>{LIST_HEADING}</h2>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshList()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {lookupError && <p className="status err">{lookupError}</p>}
              {rows.length === 0 && !listBusy && !lookupError && (
                <p className="empty">{EMPTY_LIST}</p>
              )}
              {rows.length > 0 && (
                <ul className="listings">
                  {rows.map((row) => (
                    <li key={row.listingId} className="listing">
                      <button type="button" className="open" onClick={() => openListing(row.listingId, row.list?.txid)}>
                        <span className={`stamp ${stampClass(row.status)}`}>{row.status ? stampFor(row.status) : 'Listed'}</span>
                        <h3>{row.list?.title}</h3>
                        <p className="meta-line">
                          <span className="type">{row.list ? typeLabel(row.list.assetType) : ''}</span>
                          <span className="price">{row.list ? formatPrice(row.list.priceSats) : ''}</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!listingId && (
            <section className="block">
              <p className="job">{LIST_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="title">Title</label>
                  <input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={DEFAULT_TITLE}
                    maxLength={80}
                  />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="type">Type</label>
                    <select
                      id="type"
                      value={assetType}
                      onChange={(event) => setAssetType(event.target.value as AssetType)}
                    >
                      {ASSET_TYPES.map((type) => (
                        <option key={type} value={type}>{typeLabel(type)}</option>
                      ))}
                    </select>
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
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={DEFAULT_DESCRIPTION}
                    maxLength={400}
                    rows={3}
                  />
                </div>
              </div>
              <p className="helper">{FEE_STORY}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runList()}
                >
                  {busy === 'list' ? LISTING_BUTTON : LIST_BUTTON}
                </button>
              </div>
            </section>
          )}

          {listingId && !selected && !listBusy && (
            <p className="empty">{lookupError || 'This listing wasn’t found.'}</p>
          )}

          {selected?.list && (
            <section className="block">
              <div className="show-hero">
                <span className={`stamp ${stampClass(selected.status)} fat`}>
                  {selected.status ? stampFor(selected.status) : 'Listed'}
                </span>
              </div>
              <h2>{selected.list.title}</h2>
              <dl className="meta">
                <div>
                  <dt>Type</dt>
                  <dd>{typeLabel(selected.list.assetType)}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd className="price">{formatPrice(selected.list.priceSats)}</dd>
                </div>
                <div>
                  <dt>Seller</dt>
                  <dd>{sellerLine(names[selected.list.sellerIdentity])}</dd>
                </div>
                {selected.fund && (
                  <div>
                    <dt>Buyer</dt>
                    <dd>{buyerLine(names[selected.fund.buyerIdentity])}</dd>
                  </div>
                )}
                {selected.list.description && (
                  <div className="wide">
                    <dt>Note</dt>
                    <dd>{selected.list.description}</dd>
                  </div>
                )}
                {selected.release && (
                  <div>
                    <dt>Released</dt>
                    <dd>{formatWhen(selected.release.releasedAt)}</dd>
                  </div>
                )}
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{FEE_STORY}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refreshSelected()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="btn" onClick={backHome}>
                  All listings
                </button>
              </div>
            </section>
          )}

          {selected && showFund(selected) && (
            <section className="slip">
              <p className="job">{FUND_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runFund()}
                >
                  {busy === 'fund' ? FUNDING_BUTTON : FUND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {selected && showConfirm(selected) && (
            <section className="slip">
              <p className="job">{CONFIRM_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runConfirm()}
                >
                  {busy === 'confirm' ? CONFIRMING_BUTTON : CONFIRM_BUTTON}
                </button>
              </div>
            </section>
          )}

          {selected && showRelease(selected) && (
            <section className="slip">
              <p className="job">{RELEASE_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runRelease()}
                >
                  {busy === 'release' ? RELEASING_BUTTON : RELEASE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {notice && <p className="status ok">{notice}</p>}
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
          <p>Amounts are in sats.</p>
          <p>{FEE_STORY}</p>
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {listingId && (
            <p>
              Listing id <code>{listingId}</code>
            </p>
          )}
          {(hintTxid || selected?.list?.txid) && (
            <p>
              Transaction <code>{hintTxid || selected?.list?.txid}</code>
            </p>
          )}
          {selected?.list?.sellerIdentity && (
            <p>
              Seller key <code>{shortKey(selected.list.sellerIdentity, 8)}</code>
            </p>
          )}
          {selected?.fund?.buyerIdentity && (
            <p>
              Buyer key <code>{shortKey(selected.fund.buyerIdentity, 8)}</code>
            </p>
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
