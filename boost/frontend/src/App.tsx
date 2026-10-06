import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BOOST_PACK_IDS,
  CATEGORIES,
  DEFAULT_BLURB,
  DEFAULT_CATEGORY,
  DEFAULT_LINK,
  DEFAULT_NAME,
  formatSats,
  type BoostPack,
  type Category
} from '../../protocol/boost'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanBuy, buyBoost, buyProfile, downloadReading, readingFor } from './lib/actions'
import {
  AUDIT_LINE,
  BOOSTED_WORD,
  BOOSTING_BUTTON,
  BOOST_12_BUTTON,
  BOOST_24_BUTTON,
  BOOST_JOB,
  BOOST_PACK_LABEL,
  BUYING_BUTTON,
  BUY_BUTTON,
  BUY_JOB,
  DESK_DEFAULT,
  DISTINCT_LINE,
  DUPLICATE_NOTE,
  EMPTY_LIST,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  HONESTY_LINE,
  JOB,
  LISTED_WORD,
  PRODUCT,
  PROFILE_FEE_LABEL,
  RANK_CLOCK,
  RANK_RULE,
  SCENE_ALT,
  STRANGER_LINE,
  categoryFace,
  formatRemaining,
  formatWhen,
  packFace,
  profileFeeFace
} from './lib/copy'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupDirectory, lookupProfile, type ListedProfile } from './lib/overlay'
import {
  goHome,
  goToProfile,
  parseProfileLink,
  profilePublicUrl,
  readProfileFromLocation
} from './lib/route'

type Busy = 'buy' | 'boost' | null

function packButton(pack: BoostPack, busy: Busy): string {
  if (busy === 'boost') return BOOSTING_BUTTON
  return pack === '12h' ? BOOST_12_BUTTON : BOOST_24_BUTTON
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect, clearError } = useWallet()

  const initial = useMemo(() => readProfileFromLocation(), [])
  const [profileId, setProfileId] = useState(initial.profileId ?? '')
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [view, setView] = useState<ListedProfile | null>(null)
  const [listed, setListed] = useState<ListedProfile[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY)
  const [name, setName] = useState(DEFAULT_NAME)
  const [blurb, setBlurb] = useState(DEFAULT_BLURB)
  const [link, setLink] = useState(DEFAULT_LINK)
  const [desk, setDesk] = useState('')
  const [openLink, setOpenLink] = useState('')

  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const overlayDown = online === false
  const profile = view?.profile ?? null
  const showInstall = walletMissing || actionNeedsInstall
  const combinedError = actionError || walletError

  const refresh = async (id = profileId, txid = hintTxid): Promise<void> => {
    const now = Date.now()
    setNowMs(now)
    setListBusy(true)
    try {
      if (id) {
        const next = await lookupProfile(url, id, txid || undefined, now)
        setView(next.profile)
        setLookupError(next.profile ? null : 'This listing wasn’t found.')
        return
      }
      const rows = await lookupDirectory(url, now)
      setListed(rows)
      setView(null)
      setLookupError(null)
    } catch {
      setLookupError('Can’t reach overlay. Retry')
    } finally {
      setListBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, profileId, hintTxid])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runBuy = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    try {
      assertCanBuy({
        category,
        name,
        blurb,
        link,
        desk
      }, identityKey || `02${'ee'.repeat(32)}`)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('buy')
    try {
      const session = await ensureWallet()
      if (!session) return
      const rows = listed.map((row) => row.profile)
      const result = await buyProfile(session.wallet, url, session.identityKey, {
        category,
        name,
        blurb,
        link,
        desk
      }, rows)
      setProfileId(result.profileId)
      setHintTxid(result.txid)
      goToProfile(result.profileId, result.txid)
      setNotice(result.overlayError
        ? `Profile bought. Overlay submit failed: ${result.overlayError}`
        : 'Profile bought. Share the listing link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.profileId, result.txid)
    } catch (err) {
      console.error('Buy profile failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runBoost = async (pack: BoostPack): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setNotice(null)
    clearError()
    if (!profile) {
      setActionError('This listing wasn’t found.')
      return
    }
    setBusy('boost')
    try {
      const session = await ensureWallet()
      if (!session) return
      const current = await lookupProfile(url, profile.profileId, hintTxid || view?.txid, Date.now())
      const book = current.profile?.profile ?? profile
      const result = await buyBoost(session.wallet, url, session.identityKey, book, pack)
      setHintTxid(result.txid)
      goToProfile(result.profileId, result.txid)
      setNotice(result.overlayError
        ? `Boost bought. Overlay submit failed: ${result.overlayError}`
        : `Boost bought through ${formatWhen(result.endsAt)}.`)
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.profileId, result.txid)
    } catch (err) {
      console.error('Buy boost failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const runExport = (): void => {
    if (!profile) return
    downloadReading(readingFor(profile, view?.boosts ?? [], nowMs))
  }

  const runOpen = (): void => {
    const parsed = parseProfileLink(openLink)
    if (!parsed.profileId) {
      setActionError('That link doesn’t include a listing.')
      return
    }
    setActionError(null)
    setNotice(null)
    setProfileId(parsed.profileId)
    setHintTxid(parsed.hintTxid ?? '')
    goToProfile(parsed.profileId, parsed.hintTxid)
  }

  const openListed = (row: ListedProfile): void => {
    setProfileId(row.profile.profileId)
    setHintTxid(row.txid)
    goToProfile(row.profile.profileId, row.txid)
  }

  const runHome = (): void => {
    setProfileId('')
    setHintTxid('')
    setView(null)
    setNotice(null)
    setActionError(null)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!profile) return
    const share = profilePublicUrl(profile.profileId, hintTxid || view?.txid)
    await navigator.clipboard.writeText(share)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const retry = (): void => {
    setActionNeedsInstall(false)
    clearError()
    if (profile) void runBoost('12h')
    else void runBuy()
  }

  return (
    <div className="desk">
      <div className="scene-crop hero">
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt={SCENE_ALT}
          width="1280"
          height="720"
        />
      </div>
      <div className="app">
        <article className="book">
          <header className="book-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{PRODUCT}</h1>
            <p className="lede">{JOB}</p>
          </header>

          <BusinessCase />

          {online === false && (
            <p className="status err">
              {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
            </p>
          )}

          {!profileId && (
            <section className="block">
              <p className="job">{BUY_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select
                    id="category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as Category)}
                  >
                    {CATEGORIES.map((option) => (
                      <option key={option} value={option}>{categoryFace(option)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="blurb">Blurb</label>
                  <input
                    id="blurb"
                    value={blurb}
                    onChange={(event) => setBlurb(event.target.value)}
                    maxLength={160}
                  />
                </div>
                <div className="field">
                  <label htmlFor="link">Link (optional)</label>
                  <input
                    id="link"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>
              <dl className="quote">
                <div>
                  <dt>{PROFILE_FEE_LABEL}</dt>
                  <dd>{profileFeeFace()}</dd>
                </div>
                {BOOST_PACK_IDS.map((pack) => (
                  <div key={pack}>
                    <dt>{BOOST_PACK_LABEL}</dt>
                    <dd>{packFace(pack)}</dd>
                  </div>
                ))}
              </dl>
              <p className="helper">{FEE_FACE}</p>
              <p className="helper">{HONESTY_LINE}</p>
              <p className="helper">{RANK_RULE}</p>
              <p className="helper">{DISTINCT_LINE}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runBuy()}
                >
                  {busy === 'buy' ? BUYING_BUTTON : BUY_BUTTON}
                </button>
              </div>
              <div className="field open-link">
                <label htmlFor="open-link">Open a listing</label>
                <input
                  id="open-link"
                  value={openLink}
                  onChange={(event) => setOpenLink(event.target.value)}
                  placeholder="Paste a listing link"
                />
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={runOpen}>
                  Open
                </button>
              </div>
              <p className="job holdings-label">Directory</p>
              <p className="helper">{RANK_CLOCK}</p>
              {lookupError && <p className="status err">{lookupError}</p>}
              {listed.length === 0 && !lookupError && (
                <p className="empty">{listBusy ? 'Loading…' : EMPTY_LIST}</p>
              )}
              {listed.length > 0 && (
                <ul className="holdings">
                  {listed.map((row) => (
                    <li key={row.profile.profileId}>
                      <button type="button" className="text-btn" onClick={() => openListed(row)}>
                        {row.profile.name}
                      </button>
                      <span>
                        {row.boosted && row.activeBoost
                          ? `${BOOSTED_WORD} · ${formatRemaining(row.activeBoost.endsAt, nowMs)}`
                          : LISTED_WORD}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {profileId && !profile && !listBusy && (
            <p className="empty">{lookupError || 'This listing wasn’t found.'}</p>
          )}

          {profile && (
            <section className="block">
              <h2>{profile.name}</h2>
              <dl className="meta">
                <div>
                  <dt>Category</dt>
                  <dd>{categoryFace(profile.category)}</dd>
                </div>
                <div>
                  <dt>Blurb</dt>
                  <dd>{profile.blurb}</dd>
                </div>
                {profile.link && (
                  <div>
                    <dt>Link</dt>
                    <dd><a href={profile.link}>{profile.link}</a></dd>
                  </div>
                )}
                <div>
                  <dt>{PROFILE_FEE_LABEL}</dt>
                  <dd>{formatSats(profile.profileFeeSats)}</dd>
                </div>
                <div>
                  <dt>Ranking</dt>
                  <dd>
                    {view?.boosted && view.activeBoost
                      ? `${BOOSTED_WORD} through ${formatWhen(view.activeBoost.endsAt)}`
                      : LISTED_WORD}
                  </dd>
                </div>
                <div>
                  <dt>Listed</dt>
                  <dd>{formatWhen(profile.createdAt)}</dd>
                </div>
              </dl>
              {view?.duplicate && <p className="helper">{DUPLICATE_NOTE}</p>}
              <p className="helper">{STRANGER_LINE}</p>
              <p className="helper">{FEE_FACE}</p>
              <p className="helper">{RANK_RULE}</p>
              <div className="actions">
                <button type="button" className="btn primary" onClick={runExport}>
                  {EXPORT_BUTTON}
                </button>
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                  {listBusy ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="btn" onClick={runHome}>
                  Directory
                </button>
              </div>
            </section>
          )}

          {profile && (
            <section className="slip">
              <p className="job">{BOOST_JOB}</p>
              <dl className="quote">
                {BOOST_PACK_IDS.map((pack) => (
                  <div key={pack}>
                    <dt>{BOOST_PACK_LABEL}</dt>
                    <dd>{packFace(pack)}</dd>
                  </div>
                ))}
              </dl>
              <p className="helper">{HONESTY_LINE}</p>
              <div className="actions">
                {BOOST_PACK_IDS.map((pack) => (
                  <button
                    key={pack}
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting || overlayDown || view?.duplicate === true}
                    onClick={() => void runBoost(pack)}
                  >
                    {packButton(pack, busy)}
                  </button>
                ))}
              </div>
              <p className="job holdings-label">Boost receipts</p>
              <p className="helper">{AUDIT_LINE}</p>
              {(view?.boosts.length ?? 0) === 0 && <p className="empty">No boost receipts yet.</p>}
              {(view?.boosts.length ?? 0) > 0 && (
                <ul className="holdings">
                  {view?.boosts.map((row) => (
                    <li key={row.boostId}>
                      <span>{packFace(row.pack)}</span>
                      <span>
                        {formatWhen(row.startsAt)} – {formatWhen(row.endsAt)}
                        {Date.parse(row.startsAt) <= nowMs && nowMs < Date.parse(row.endsAt)
                          ? ` · ${BOOSTED_WORD}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {notice && <p className="status ok">{notice}</p>}
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
          <p>{HONESTY_LINE}</p>
          <p>{DESK_DEFAULT}</p>
          <label htmlFor="desk-key">Desk key</label>
          <input
            id="desk-key"
            value={desk}
            onChange={(event) => setDesk(event.target.value)}
            placeholder="Identity key that receives the fees"
          />
          {identityKey && (
            <p>
              Wallet key <code>{shortKey(identityKey, 8)}</code>
            </p>
          )}
          {profileId && (
            <p>
              Profile id <code>{profileId}</code>
            </p>
          )}
          {(hintTxid || view?.txid) && (
            <p>
              Transaction <code>{hintTxid || view?.txid}</code>
            </p>
          )}
          <label htmlFor="overlay-url">Overlay URL</label>
          <input id="overlay-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p>Operators can point this at a local indexer. The topic stays the public one.</p>
        </details>
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
