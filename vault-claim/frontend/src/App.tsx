import { useEffect, useState } from 'react'
import { isHolder, resolveSampleHash } from '../../protocol/claim'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanIssue,
  fulfillTransfers,
  issueClaim,
  listHeldClaims,
  redeemClaim,
  transferClaim,
  type HeldClaim,
  type RedeemReading
} from './lib/actions'
import {
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  ISSUE_BUTTON,
  ISSUE_HEADING,
  ISSUE_JOB,
  LEDE,
  LIST_HEADING,
  REDEEMED,
  REDEEM_BUTTON,
  SHIP_TO_LABEL,
  STATUS_HELD,
  STATUS_REDEEMED,
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
import { displayNameFor, heldLine } from './lib/identity'
import { lookupClaims, type OverlayClaim } from './lib/overlay'

const SCENE_SRC = `${import.meta.env.BASE_URL}scenes/vault-claim.webp`
const SCENE_ALT = 'A clerk passing a claim slip through a courtyard vault window.'

function SceneCrop({ kind }: { kind: 'hero' | 'sliver' }) {
  const hero = kind === 'hero'
  return (
    <div className={`scene-crop ${kind}`} aria-hidden={hero ? undefined : true}>
      <img
        className="scene"
        src={SCENE_SRC}
        alt={hero ? SCENE_ALT : ''}
        width={1400}
        height={933}
        decoding="async"
        {...(hero ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
      />
    </div>
  )
}

function Chip() {
  return <span className="chip" aria-hidden="true" />
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<OverlayClaim[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<HeldClaim[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [itemId, setItemId] = useState('')
  const [sample, setSample] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [toById, setToById] = useState<Record<string, string>>({})
  const [shipById, setShipById] = useState<Record<string, string>>({})
  const [transferOpen, setTransferOpen] = useState<string | null>(null)
  const [redeemOpen, setRedeemOpen] = useState<string | null>(null)

  const [busy, setBusy] = useState<'issue' | 'transfer' | 'redeem' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'issue' | 'transfer' | 'redeem'>('issue')
  const [lastClaimId, setLastClaimId] = useState<string | null>(null)
  const [reading, setReading] = useState<RedeemReading | null>(null)

  const overlayDown = online === false
  const hashPreview = sample.trim() ? resolveSampleHash(sample) : ''
  const priceSats = priceInput.trim() === '' ? 0 : Number(priceInput)
  const sceneKind = reading ? 'sliver' : 'hero'

  const refreshHeld = async (sessionWallet: NonNullable<typeof wallet>): Promise<HeldClaim[]> => {
    const next = await listHeldClaims(sessionWallet)
    setHeld(next)
    return next
  }

  const refresh = async (): Promise<void> => {
    setListBusy(true)
    setListError(null)
    try {
      const next = await lookupClaims(url)
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

  const heldFor = (claimId: string): HeldClaim | undefined => {
    return held.find((item) => item.claim.claimId === claimId)
  }

  /** Guest: show Transfer/Redeem so first action can learn identity. After that, holder only. */
  const canActOn = (row: OverlayClaim): boolean => {
    if (row.status === 'redeemed') return false
    if (!identityKey) return true
    return isHolder(row, identityKey)
  }

  const runIssue = async (): Promise<void> => {
    setLastAction('issue')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      assertCanIssue({ label, itemId, sample, priceSats })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('issue')
    try {
      const result = await issueClaim(session.wallet, url, session.identityKey, {
        label,
        itemId,
        sample,
        priceSats
      })
      setStatus(result.overlayError
        ? `Issued. Overlay submit failed: ${result.overlayError}`
        : 'Issued.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setLabel('')
        setItemId('')
        setSample('')
        setPriceInput('')
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

  const runTransfer = async (row: OverlayClaim): Promise<void> => {
    setLastAction('transfer')
    setLastClaimId(row.claimId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (identityKey && !isHolder(row, identityKey)) return
    if (transferOpen !== row.claimId) {
      setTransferOpen(row.claimId)
      setRedeemOpen(null)
      return
    }
    if (!(toById[row.claimId] ?? '').trim()) return
    const session = await ensureWallet()
    if (!session) return
    if (!isHolder(row, session.identityKey)) return
    const mine = heldFor(row.claimId) ?? (await refreshHeld(session.wallet)).find((item) => item.claim.claimId === row.claimId)
    if (!mine) {
      setActionError('This wallet does not hold that claim yet.')
      return
    }
    setBusy('transfer')
    try {
      const result = await transferClaim(
        session.wallet,
        url,
        session.identityKey,
        mine,
        toById[row.claimId] ?? ''
      )
      setStatus(result.overlayError
        ? `Transferred. Overlay submit failed: ${result.overlayError}`
        : 'Transferred.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setTransferOpen(null)
        setToById((current) => ({ ...current, [row.claimId]: '' }))
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

  const runRedeem = async (row: OverlayClaim): Promise<void> => {
    setLastAction('redeem')
    setLastClaimId(row.claimId)
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    if (identityKey && !isHolder(row, identityKey)) return
    if (redeemOpen !== row.claimId) {
      setRedeemOpen(row.claimId)
      setTransferOpen(null)
      return
    }
    if (!(shipById[row.claimId] ?? '').trim()) return
    const session = await ensureWallet()
    if (!session) return
    if (!isHolder(row, session.identityKey)) return
    const mine = heldFor(row.claimId) ?? (await refreshHeld(session.wallet)).find((item) => item.claim.claimId === row.claimId)
    if (!mine) {
      setActionError('This wallet does not hold that claim yet.')
      return
    }
    setBusy('redeem')
    try {
      const result = await redeemClaim(
        session.wallet,
        url,
        session.identityKey,
        mine,
        shipById[row.claimId] ?? ''
      )
      setReading(result.reading)
      setStatus(result.overlayError
        ? `${REDEEMED} Overlay submit failed: ${result.overlayError}`
        : REDEEMED)
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setRedeemOpen(null)
        setShipById((current) => ({ ...current, [row.claimId]: '' }))
      }
      await refreshHeld(session.wallet)
      await refresh()
    } catch (err) {
      console.error('Redeem failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'transfer') {
      const row = rows.find((item) => item.claimId === lastClaimId)
      if (row) void runTransfer(row)
      return
    }
    if (lastAction === 'redeem') {
      const row = rows.find((item) => item.claimId === lastClaimId)
      if (row) void runRedeem(row)
      return
    }
    void runIssue()
  }

  const combinedError = actionError || walletError
  const showInstall = walletMissing || actionNeedsInstall

  return (
    <div className="room">
      <SceneCrop kind={sceneKind} />
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            <p className="eyebrow">{EYEBROW}</p>
            <p className="product-title">
              <Chip />
              {TITLE}
            </p>
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
                  <li key={`${row.claimId}-${row.txid}.${row.outputIndex}`} className="listing">
                    <h3>{row.label}</h3>
                    <p className={`status-word ${row.status}`}>
                      {row.status === 'redeemed' ? STATUS_REDEEMED : STATUS_HELD}
                    </p>
                    <p className="job">{heldLine(names[row.holder])}</p>
                    {canActOn(row) && transferOpen === row.claimId && (
                      <div className="field">
                        <label htmlFor={`to-${row.claimId}`}>{TO_LABEL}</label>
                        <input
                          id={`to-${row.claimId}`}
                          value={toById[row.claimId] ?? ''}
                          onChange={(event) => setToById((current) => ({
                            ...current,
                            [row.claimId]: event.target.value
                          }))}
                          placeholder="Name"
                        />
                      </div>
                    )}
                    {canActOn(row) && redeemOpen === row.claimId && (
                      <div className="field">
                        <label htmlFor={`ship-${row.claimId}`}>{SHIP_TO_LABEL}</label>
                        <input
                          id={`ship-${row.claimId}`}
                          value={shipById[row.claimId] ?? ''}
                          onChange={(event) => setShipById((current) => ({
                            ...current,
                            [row.claimId]: event.target.value
                          }))}
                          placeholder="Courtyard window 3"
                        />
                      </div>
                    )}
                    {canActOn(row) && (
                    <div className="actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy !== null || connecting || overlayDown}
                        onClick={() => void runTransfer(row)}
                      >
                        {busy === 'transfer' && lastClaimId === row.claimId ? 'Transferring…' : TRANSFER_BUTTON}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy !== null || connecting || overlayDown}
                        onClick={() => void runRedeem(row)}
                      >
                        {busy === 'redeem' && lastClaimId === row.claimId ? 'Redeeming…' : REDEEM_BUTTON}
                      </button>
                    </div>
                    )}
                    <details className="advanced">
                      <summary>Advanced</summary>
                      <p>Item <code>{row.itemId}</code></p>
                      {row.sampleHash && <p>Sample hash <code>{shortKey(row.sampleHash)}</code></p>}
                      {row.requestId && <p>Request <code>{shortKey(row.requestId)}</code></p>}
                      <p>Holder <code>{shortKey(row.holder)}</code></p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {reading && (
            <section className="receipt">
              <h2>Receipt</h2>
              <p className="facts">
                {reading.label}
                <br />
                {REDEEMED}
                <br />
                {SHIP_TO_LABEL} {reading.shipTo}
              </p>
              <details className="advanced">
                <summary>Advanced</summary>
                <p>Item <code>{reading.itemId}</code></p>
                <p>Request <code>{shortKey(reading.requestId)}</code></p>
              </details>
            </section>
          )}

          <section className="block">
            <h2>{ISSUE_HEADING}</h2>
            <p className="job">{ISSUE_JOB}</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="label">Label</label>
                <input
                  id="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Charizard 4/102"
                />
              </div>
              <div className="field">
                <label htmlFor="item">Item</label>
                <input
                  id="item"
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                  placeholder="PSA-81234567"
                />
              </div>
              <div className="field">
                <label htmlFor="price">Price</label>
                <input
                  id="price"
                  type="number"
                  min={0}
                  max={100000000}
                  value={priceInput}
                  onChange={(event) => setPriceInput(event.target.value)}
                />
              </div>
              <details className="advanced">
                <summary>Advanced</summary>
                <label htmlFor="sample">Sample or photo hash</label>
                <textarea
                  id="sample"
                  rows={3}
                  value={sample}
                  onChange={(event) => setSample(event.target.value)}
                  placeholder="Optional photo, or a 64-character hash"
                  spellCheck={false}
                />
                <label htmlFor="hash">Sample hash</label>
                <input
                  id="hash"
                  value={hashPreview ? shortKey(hashPreview) : ''}
                  readOnly
                  placeholder="Fills from the sample"
                />
                <p>Amounts are in sats. Holder keys stay here.</p>
              </details>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown || !label.trim() || !itemId.trim()}
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
