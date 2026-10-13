import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SAMPLE_BUYER,
  SAMPLE_RECIPIENT,
  emptyDesk,
  giftPiece,
  holderOf,
  mintPiece,
  openEdition,
  profileOf,
  resaleSplit,
  resellPiece,
  sendPiece,
  showPiece,
  supplyOf,
  type DeskState
} from '../../protocol/keepsake'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanOpen, parseWhole, recordKeepsake } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  BOOK_EMPTY,
  BOOK_HEADING,
  BUYER_LABEL,
  DESK_LABEL,
  EYEBROW,
  FEE_HELPER,
  FOOTER,
  GIFT_BUTTON,
  GIFT_JOB,
  HOLDER_JOB,
  LEDE,
  LINE_DESK,
  LINE_MINT_FEE,
  LINE_PRICE,
  LINE_ROYALTY,
  LINE_SELLER,
  LOCAL_NOTE,
  MINT_BUTTON,
  MINT_FEE_LABEL,
  MINT_JOB,
  OPEN_BUTTON,
  OPEN_JOB,
  ORG_LABEL,
  PRICE_LABEL,
  RECEIPT_NOTE,
  RECIPIENT_LABEL,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  REFRESH_BUTTON,
  RESALE_BUTTON,
  RESALE_JOB,
  ROYALTY_LABEL,
  SCENE_ALT,
  SEND_BUTTON,
  SEND_JOB,
  SHOW_BUTTON,
  SIZE_LABEL,
  STRANGER_LINE,
  TITLE,
  TITLE_LABEL,
  formatAmount,
  pieceLabel
} from './lib/copy'
import { bookFromItems, lookupKeepsake, lookupKeepsakeItems, type ListedEdition } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { goHome, goToKeepsake, keepsakePublicUrl, readKeepsakeFromLocation } from './lib/route'

type Busy = 'record' | null

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readKeepsakeFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [orgName, setOrgName] = useState('')
  const [title, setTitle] = useState('')
  const [editionSize, setEditionSize] = useState('500')
  const [mintFee, setMintFee] = useState('1000')
  const [royaltyBps, setRoyaltyBps] = useState('500')
  const [deskBps, setDeskBps] = useState('200')
  const [recipient, setRecipient] = useState(SAMPLE_RECIPIENT)
  const [buyer, setBuyer] = useState(SAMPLE_BUYER)
  const [price, setPrice] = useState('10000')
  const [giftTo, setGiftTo] = useState('')
  const [activeSerial, setActiveSerial] = useState<number | null>(null)
  const [book, setBook] = useState<ListedEdition[]>([])
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const edition = desk.edition
  const supply = supplyOf(desk)
  const serial = activeSerial ?? desk.mints.at(-1)?.serial ?? null
  const holder = edition && serial ? holderOf(desk, serial) : null
  const held = holder ? profileOf(desk, holder).find((piece) => piece.serial === serial) : undefined
  const latestResale = serial ? desk.resales.filter((row) => row.serial === serial).at(-1) : undefined

  const resalePreview = useMemo(() => {
    if (!edition) return null
    const amount = parseWhole(price)
    if (amount == null) return null
    try {
      return resaleSplit(amount, edition.royaltyBps, edition.deskBps)
    } catch {
      return null
    }
  }, [edition, price])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!edition || readonly) return
    saveDesk(edition.keepsakeId, desk)
  }, [desk, edition, readonly])

  useEffect(() => {
    let cancel = false
    void lookupKeepsakeItems(url)
      .then((items) => {
        if (cancel) return
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => {
        if (!cancel) setBookError('The public book didn’t load.')
      })
    return () => {
      cancel = true
    }
  }, [url])

  useEffect(() => {
    const located = readKeepsakeFromLocation()
    if (!located.keepsakeId) return
    const local = loadDesk(located.keepsakeId)
    if (local) {
      setDesk(local)
      setActiveSerial(local.mints.at(-1)?.serial ?? null)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupKeepsake(url, located.keepsakeId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote?.edition) return
        setDesk(remote)
        setActiveSerial(remote.mints.at(-1)?.serial ?? null)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This keepsake wasn’t found.')
      })
    return () => {
      cancel = true
    }
  }, [url])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const fail = (err: unknown): void => {
    setActionError(errorMessage(err))
    setActionNeedsInstall(false)
  }

  const runOpen = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    const size = parseWhole(editionSize)
    const fee = parseWhole(mintFee)
    const royalty = parseWhole(royaltyBps)
    const cut = parseWhole(deskBps)
    try {
      const ready = assertCanOpen({
        orgName,
        title,
        editionSize: size ?? 0,
        mintFeeSats: fee ?? -1,
        royaltyBps: royalty ?? -1,
        deskBps: cut ?? -1
      })
      const next = openEdition(ready)
      setDesk(next)
      setReadonly(false)
      setActiveSerial(null)
      if (next.edition) goToKeepsake(next.edition.keepsakeId)
    } catch (err) {
      fail(err)
    }
  }

  const runMint = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      const next = mintPiece(desk)
      setDesk(next)
      setActiveSerial(next.mints.at(-1)?.serial ?? null)
    } catch (err) {
      fail(err)
    }
  }

  const runSend = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    if (!serial) return
    try {
      setDesk(sendPiece(desk, serial, recipient))
    } catch (err) {
      fail(err)
    }
  }

  const runGift = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    if (!serial) return
    try {
      setDesk(giftPiece(desk, serial, giftTo))
    } catch (err) {
      fail(err)
    }
  }

  const runShow = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    if (!serial) return
    try {
      setDesk(showPiece(desk, serial))
    } catch (err) {
      fail(err)
    }
  }

  const runResell = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    if (!serial) return
    const amount = parseWhole(price)
    try {
      setDesk(resellPiece(desk, serial, buyer, amount ?? 0))
    } catch (err) {
      fail(err)
    }
  }

  const runRecord = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    const session = await ensureWallet()
    if (!session) return
    setBusy('record')
    try {
      const result = await recordKeepsake(session.wallet, url, session.identityKey, desk)
      setHintTxid(result.txid)
      if (desk.edition) goToKeepsake(desk.edition.keepsakeId, result.txid)
      setActionError(result.overlayError ?? null)
      const items = await lookupKeepsakeItems(url).catch(() => null)
      if (items) setBook(bookFromItems(items))
    } catch (err) {
      console.error('Record keepsake failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (edition) clearDesk(edition.keepsakeId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setActiveSerial(null)
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!edition) return
    try {
      await navigator.clipboard.writeText(keepsakePublicUrl(edition.keepsakeId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const openListed = (row: ListedEdition): void => {
    const local = loadDesk(row.keepsakeId)
    if (local) {
      setDesk(local)
      setReadonly(false)
    } else {
      setDesk({
        edition: row.edition,
        mints: row.mints,
        sends: row.sends,
        gifts: row.gifts,
        shows: row.shows,
        resales: row.resales,
        rejection: null,
        notice: null
      })
      setReadonly(true)
    }
    setActiveSerial(row.mints.at(-1)?.serial ?? null)
    setHintTxid(row.txid ?? '')
    goToKeepsake(row.keepsakeId, row.txid)
  }

  const refreshBook = (): void => {
    void lookupKeepsakeItems(url)
      .then((items) => {
        setBook(bookFromItems(items))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  const combinedError = actionError || walletError
  const full = Boolean(edition && supply.remaining === 0)

  return (
    <div className="table-scene">
      <div className={`scene-crop ${edition ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt={SCENE_ALT}
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{TITLE}</h1>
            <p className="lede">{LEDE}</p>
          </header>

          <BusinessCase />
          <p className="receipt-note">{RECEIPT_NOTE}</p>

          {!edition && (
            <section className="block">
              <p className="job">{OPEN_JOB}</p>
              <div className="fields">
                <div className="grid">
                  <div className="field">
                    <label htmlFor="org">{ORG_LABEL}</label>
                    <input id="org" value={orgName} maxLength={80} placeholder="North Hall Volunteers" onChange={(event) => setOrgName(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="title">{TITLE_LABEL}</label>
                    <input id="title" value={title} maxLength={80} placeholder="Founding Volunteer 2026" onChange={(event) => setTitle(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="edition-size">{SIZE_LABEL}</label>
                    <input id="edition-size" inputMode="numeric" value={editionSize} onChange={(event) => setEditionSize(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="mint-fee">{MINT_FEE_LABEL}</label>
                    <input id="mint-fee" inputMode="numeric" value={mintFee} onChange={(event) => setMintFee(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="royalty-bps">{ROYALTY_LABEL}</label>
                    <input id="royalty-bps" inputMode="numeric" value={royaltyBps} onChange={(event) => setRoyaltyBps(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="desk-bps">{DESK_LABEL}</label>
                    <input id="desk-bps" inputMode="numeric" value={deskBps} onChange={(event) => setDeskBps(event.target.value)} />
                  </div>
                </div>
              </div>
              <p className="helper">{FEE_HELPER}</p>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runOpen}>
                  {OPEN_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && (
            <section className="block" id="edition-summary">
              <div className="seal-card">
                <p className="seal-kicker">{edition.orgName}</p>
                <h2>{edition.title}</h2>
                <p className="seal-number">{serial ? pieceLabel(serial, edition.editionSize) : 'Not minted yet'}</p>
              </div>
              <p className="status ok" id="edition-cap">
                Edition {formatAmount(supply.minted)} of {formatAmount(supply.editionSize)}. {formatAmount(supply.remaining)} left. The count is fixed.
              </p>
              {serial && desk.mints.some((row) => row.serial === serial) && (
                <p id="mint-line">Minted {pieceLabel(serial, edition.editionSize)}.</p>
              )}
              {serial && desk.sends.some((row) => row.serial === serial) && (
                <p id="send-line">Sent to {shortKey(desk.sends.filter((row) => row.serial === serial).at(-1)?.recipientKey ?? '', 8)}.</p>
              )}
              <dl className="fees">
                <div>
                  <dt>{LINE_MINT_FEE}</dt>
                  <dd>{formatAmount(edition.mintFeeSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_ROYALTY}</dt>
                  <dd>{edition.royaltyBps} bps</dd>
                </div>
                <div>
                  <dt>{LINE_DESK}</dt>
                  <dd>{edition.deskBps} bps</dd>
                </div>
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" onClick={startOver}>Start over</button>
              </div>
            </section>
          )}

          {edition && serial && holder && (
            <section className="slip" id="holder-view">
              <p className="job">{HOLDER_JOB}</p>
              <p className="status ok">Holder sees {edition.title} {pieceLabel(serial, edition.editionSize)}.</p>
              <p className="helper">Identity key {shortKey(holder, 8)}</p>
              {held?.shown && <p className="status ok">Marked for a public profile. That flag is desk state until you record.</p>}
            </section>
          )}

          {latestResale && (
            <section className="slip">
              <p className="fine">Resale</p>
              <dl className="fees" id="resale-split">
                <div>
                  <dt>{LINE_PRICE}</dt>
                  <dd>{formatAmount(latestResale.priceSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_ROYALTY}</dt>
                  <dd>{formatAmount(latestResale.royaltySats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_DESK}</dt>
                  <dd>{formatAmount(latestResale.deskSats)} sats</dd>
                </div>
                <div>
                  <dt>{LINE_SELLER}</dt>
                  <dd>{formatAmount(latestResale.sellerSats)} sats</dd>
                </div>
              </dl>
              <p className="helper">The desk recorded this split. The sale sats are not moved here.</p>
            </section>
          )}

          {edition && !readonly && (
            <section className="slip">
              <p className="job">{MINT_JOB}</p>
              {full && <p className="status err" role="alert">{desk.rejection}</p>}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || full} onClick={runMint}>
                  {MINT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && !readonly && serial && (
            <section className="slip">
              <p className="job">{SEND_JOB}</p>
              <div className="field">
                <label htmlFor="recipient">{RECIPIENT_LABEL}</label>
                <input id="recipient" value={recipient} spellCheck={false} onChange={(event) => setRecipient(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runSend}>
                  {SEND_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && !readonly && holder && (
            <section className="slip">
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null} onClick={runShow}>
                  {SHOW_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && !readonly && holder && (
            <section className="slip">
              <p className="job">{GIFT_JOB}</p>
              <div className="field">
                <label htmlFor="gift-to">{RECIPIENT_LABEL}</label>
                <input id="gift-to" value={giftTo} spellCheck={false} onChange={(event) => setGiftTo(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null} onClick={runGift}>
                  {GIFT_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && !readonly && holder && (
            <section className="slip">
              <p className="job">{RESALE_JOB}</p>
              <div className="grid">
                <div className="field">
                  <label htmlFor="price">{PRICE_LABEL}</label>
                  <input id="price" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="buyer">{BUYER_LABEL}</label>
                  <input id="buyer" value={buyer} spellCheck={false} onChange={(event) => setBuyer(event.target.value)} />
                </div>
              </div>
              {resalePreview && (
                <dl className="fees" id="resale-preview">
                  <div>
                    <dt>{LINE_PRICE}</dt>
                    <dd>{formatAmount(resalePreview.priceSats)} sats</dd>
                  </div>
                  <div>
                    <dt>{LINE_ROYALTY}</dt>
                    <dd>{formatAmount(resalePreview.royaltySats)} sats</dd>
                  </div>
                  <div>
                    <dt>{LINE_DESK}</dt>
                    <dd>{formatAmount(resalePreview.deskSats)} sats</dd>
                  </div>
                  <div>
                    <dt>{LINE_SELLER}</dt>
                    <dd>{formatAmount(resalePreview.sellerSats)} sats</dd>
                  </div>
                </dl>
              )}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null || !resalePreview} onClick={runResell}>
                  {RESALE_BUTTON}
                </button>
              </div>
            </section>
          )}

          {edition && !readonly && (
            <section className="slip">
              <p className="job">{RECORD_JOB}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting}
                  onClick={() => void runRecord()}
                >
                  {busy === 'record' ? RECORDING_BUTTON : RECORD_BUTTON}
                </button>
              </div>
            </section>
          )}

          <section className="slip" id="public-book">
            <h2>{BOOK_HEADING}</h2>
            <p className="job">Fixed editions and numbered pieces from the public book.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {book.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {book.length > 0 && (
              <ul className="receipts">
                {book.map((row) => (
                  <li key={row.keepsakeId}>
                    <button type="button" className="text-btn" onClick={() => openListed(row)}>
                      {row.edition.title}
                    </button>
                    <span> {formatAmount(row.mints.length)} of {formatAmount(row.edition.editionSize)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {desk.notice && <p className="status ok">{desk.notice}</p>}
          {combinedError && <p className="status err">{combinedError}</p>}
          {desk.rejection && !full && (
            <p className="status err" role="alert">{desk.rejection}</p>
          )}
        </article>

        {showInstall && (
          <div className="install" ref={installRef}>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy !== null || connecting} onClick={() => void runRecord()}>
                Retry
              </button>
              <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
                Install BSV Desktop
              </a>
            </div>
          </div>
        )}
        {combinedError === CHROME_ALLOW_HINT && <p className="helper">{CHROME_ALLOW_HINT}</p>}

        <details className="advanced">
          <summary>Advanced</summary>
          <p>Amounts are in sats.</p>
          <p>{LOCAL_NOTE}</p>
          <p>{FEE_HELPER}</p>
          <p>Recording uses a BSV Desktop wallet.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {edition && <p>Keepsake id <code>{edition.keepsakeId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
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
