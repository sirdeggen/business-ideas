import { useEffect, useState } from 'react'
import { isHolder, resolveItemHash } from '../../protocol/claim'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  assertCanMint,
  assertSerialFree,
  fulfillTransfers,
  listHeldClaims,
  mintClaim,
  redeemClaim,
  transferClaim,
  type HeldClaim
} from './lib/actions'
import {
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  LIST_HEADING,
  MINT_BUTTON,
  MINT_HEADING,
  MINT_JOB,
  REDEEMED,
  REDEEM_BUTTON,
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

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()

  const [rows, setRows] = useState<OverlayClaim[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<HeldClaim[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [itemSerial, setItemSerial] = useState('')
  const [itemHashNote, setItemHashNote] = useState('')
  const [priceSats, setPriceSats] = useState(100)
  const [toById, setToById] = useState<Record<string, string>>({})
  const [transferOpen, setTransferOpen] = useState<string | null>(null)

  const [busy, setBusy] = useState<'mint' | 'transfer' | 'redeem' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [lastAction, setLastAction] = useState<'mint' | 'transfer' | 'redeem'>('mint')
  const [lastClaimId, setLastClaimId] = useState<string | null>(null)

  const overlayDown = online === false
  const hashPreview = itemHashNote.trim() ? resolveItemHash(itemHashNote) : ''

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

  /** Guest: show Transfer/Redeem so first Redeem can learn identity. After that, holder only. */
  const canActOn = (row: OverlayClaim): boolean => {
    if (!identityKey) return true
    return isHolder(row, identityKey)
  }

  const runMint = async (): Promise<void> => {
    setLastAction('mint')
    setActionError(null)
    setActionNeedsInstall(false)
    setStatus(null)
    try {
      assertCanMint({ label, itemSerial, itemHashNote, priceSats })
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    const session = await ensureWallet()
    if (!session) return
    try {
      assertSerialFree(rows, session.identityKey, itemSerial)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('mint')
    try {
      const result = await mintClaim(session.wallet, url, session.identityKey, {
        label,
        itemSerial,
        itemHashNote,
        priceSats
      }, rows)
      setStatus(result.overlayError
        ? `Minted. Overlay submit failed: ${result.overlayError}`
        : 'Minted.')
      if (result.overlayError) setActionError(result.overlayError)
      else {
        setLabel('')
        setItemSerial('')
        setItemHashNote('')
      }
      await refreshHeld(session.wallet)
      await refresh()
    } catch (err) {
      console.error('Mint failed', err)
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
      const result = await redeemClaim(session.wallet, url, session.identityKey, mine)
      setStatus(result.overlayError
        ? `${REDEEMED} Overlay submit failed: ${result.overlayError}`
        : REDEEMED)
      if (result.overlayError) setActionError(result.overlayError)
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
    void runMint()
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
                  <p className="serial">{row.itemSerial}</p>
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
                    {row.itemHash && <p>Item hash <code>{shortKey(row.itemHash)}</code></p>}
                    {!row.itemHash && <p>No item hash on this claim.</p>}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block">
          <h2>{MINT_HEADING}</h2>
          <p className="job">{MINT_JOB}</p>
          <div className="fields">
            <div className="field">
              <label htmlFor="label">Label</label>
              <input
                id="label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Jordan 1986 Fleer"
              />
            </div>
            <div className="field">
              <label htmlFor="item">Item</label>
              <input
                id="item"
                value={itemSerial}
                onChange={(event) => setItemSerial(event.target.value)}
                placeholder="PSA 9.5 · 25-0147"
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
              <label htmlFor="hash">Item hash</label>
              <input
                id="hash"
                value={itemHashNote}
                onChange={(event) => setItemHashNote(event.target.value)}
                placeholder="Optional note or 64-character hash"
              />
              {hashPreview && <p>Hash <code>{shortKey(hashPreview)}</code></p>}
              <p>Amounts are in sats.</p>
            </details>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null || connecting || overlayDown || !label.trim() || !itemSerial.trim()}
              onClick={() => void runMint()}
            >
              {busy === 'mint' ? 'Minting…' : MINT_BUTTON}
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
