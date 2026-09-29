import { useEffect, useMemo, useRef, useState } from 'react'
import { sha256Hex } from '../../protocol/sha256'
import {
  ALREADY_PAYEE,
  ATTEST_MATCH,
  ATTEST_MISMATCH,
  HASH_MATCH,
  HASH_MISMATCH,
  NEED_NAME,
  SWAP_REJECTED,
  approvePayeeChange,
  approveRelease,
  attachDeed,
  attemptPayeeSwap,
  attestDeed,
  attestationMatches,
  checkHash,
  deskFeeLines,
  emptyDesk,
  feeLines,
  openClosing,
  partiesOf,
  payeeChanged,
  releaseClosing,
  releaseReady,
  type DeskState,
  type FeeLines,
  type PartyRole
} from '../../protocol/closing'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { assertCanOpen, parseWhole, recordClosing } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  AGENT_NAME,
  AMOUNT_LABEL,
  ATTEST_BUTTON,
  ATTACH_BUTTON,
  ATTACHING_BUTTON,
  BUYER_NAME,
  CHECK_BUTTON,
  DEFAULT_LABEL,
  DEED_JOB,
  EYEBROW,
  FOOTER,
  LEDE,
  LINE_AMOUNT,
  LINE_AMENDMENT,
  LINE_BPS,
  LINE_FEE,
  LINE_NET,
  LOCAL_ROLES_NOTE,
  OPEN_BUTTON,
  OPEN_JOB,
  PARTIES_HEADING,
  PARTY_CHANGE_HELPER,
  PAYEE_HELPER,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  RELEASE_BUTTON,
  RELEASE_JOB,
  SELLER_NAME,
  STAMP_BOUND,
  STAMP_CHANGED,
  STAMP_RELEASED,
  STRANGER_LINE,
  SWAP_BUTTON,
  SWAP_JOB,
  TITLE,
  approvalLine,
  formatAmount,
  formatWhen,
  payeeFlagLine
} from './lib/copy'
import { lookupClosing } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { closingPublicUrl, goHome, goToClosing, readClosingFromLocation } from './lib/route'

type Busy = 'attach' | 'check' | 'record' | null

function hashBytes(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return crypto.subtle.digest('SHA-256', copy).then((digest) => (
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  ))
}

function stampFor(desk: DeskState): string {
  if (desk.released) return STAMP_RELEASED
  if (desk.open && payeeChanged(desk.open)) return STAMP_CHANGED
  return STAMP_BOUND
}

function FeeTable({ lines, showAmendment }: { lines: FeeLines, showAmendment: boolean }) {
  return (
    <dl className="fees">
      <div>
        <dt>{LINE_AMOUNT}</dt>
        <dd>{formatAmount(lines.amountSats)}</dd>
      </div>
      <div>
        <dt>{LINE_BPS}</dt>
        <dd>{lines.feeBps}</dd>
      </div>
      <div>
        <dt>{LINE_FEE}</dt>
        <dd>{formatAmount(lines.feeSats)}</dd>
      </div>
      {showAmendment && (
        <div>
          <dt>{LINE_AMENDMENT}</dt>
          <dd>{formatAmount(lines.amendmentFeeSats)}</dd>
        </div>
      )}
      <div>
        <dt>{LINE_NET}</dt>
        <dd>{formatAmount(lines.netSats)}</dd>
      </div>
    </dl>
  )
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readClosingFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [amount, setAmount] = useState('')
  const [seller, setSeller] = useState(SELLER_NAME)
  const [includeAgent, setIncludeAgent] = useState(true)
  const [agent, setAgent] = useState(AGENT_NAME)
  const [feeBps, setFeeBps] = useState('100')
  const [amendment, setAmendment] = useState('')
  const [deedText, setDeedText] = useState('Assignment of mineral interest')
  const [deedFile, setDeedFile] = useState<File | null>(null)
  const [proposed, setProposed] = useState('New wire desk')
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const open = desk.open
  const lines = deskFeeLines(desk)
  const blocked = open ? releaseReady(desk) : null
  const parties = open ? partiesOf(open) : []

  const preview = useMemo(() => {
    const amountSats = parseWhole(amount)
    const bps = parseWhole(feeBps)
    if (amountSats == null || bps == null) return null
    const draft = feeLines({ amountSats, feeBps: bps, amendmentFeeSats: 0 })
    if (draft.netSats < 1) return null
    return draft
  }, [amount, feeBps])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!open || readonly) return
    saveDesk(open.closingId, desk)
  }, [desk, open, readonly])

  useEffect(() => {
    const located = readClosingFromLocation()
    if (!located.closingId) return
    const local = loadDesk(located.closingId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupClosing(url, located.closingId, located.hintTxid ?? undefined)
      .then((remote) => {
        if (cancel || !remote?.open) return
        setDesk(remote)
        setReadonly(true)
      })
      .catch(() => {
        if (!cancel) setActionError('This closing wasn’t found.')
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
    const amountSats = parseWhole(amount)
    const bps = parseWhole(feeBps)
    const amendmentFeeSats = amendment.trim() ? parseWhole(amendment) : 0
    try {
      const ready = assertCanOpen({
        label,
        amountSats: amountSats ?? 0,
        feeBps: bps ?? -1,
        amendmentFeeSats: amendmentFeeSats ?? -1,
        sellerName: seller,
        includeAgent,
        agentName: agent
      })
      const next = openClosing({
        label: ready.label,
        amountSats: ready.amountSats,
        feeBps: ready.feeBps,
        amendmentFeeSats: ready.amendmentFeeSats,
        sellerName: ready.sellerName,
        includeAgent: ready.includeAgent,
        agentName: ready.agentName,
        buyerName: BUYER_NAME
      })
      setDesk(next)
      setReadonly(false)
      if (next.open) goToClosing(next.open.closingId)
    } catch (err) {
      fail(err)
    }
  }

  const sourceHash = async (): Promise<{ hash: string, docLabel: string } | null> => {
    if (deedFile) {
      const bytes = new Uint8Array(await deedFile.arrayBuffer())
      return { hash: await hashBytes(bytes), docLabel: deedFile.name }
    }
    if (!deedText.trim()) return null
    return { hash: sha256Hex(deedText), docLabel: 'Pasted deed' }
  }

  const runAttach = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setBusy('attach')
    try {
      const source = await sourceHash()
      if (!source) {
        setActionError('Add a deed file or paste the text.')
        return
      }
      setDesk(attachDeed(desk, source.hash, source.docLabel))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runCheck = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setBusy('check')
    try {
      const source = await sourceHash()
      setDesk(checkHash(desk, source?.hash ?? ''))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const runAttest = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    setDesk(attestDeed(desk))
  }

  const runSwap = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    try {
      setDesk(attemptPayeeSwap(desk, proposed))
    } catch (err) {
      fail(err)
    }
  }

  const runApprove = (purpose: 'payee' | 'release', role: PartyRole): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    setDesk(purpose === 'payee' ? approvePayeeChange(desk, role) : approveRelease(desk, role))
  }

  const runRelease = (): void => {
    setActionError(null)
    setActionNeedsInstall(false)
    setDesk(releaseClosing(desk))
  }

  const runRecord = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    const session = await ensureWallet()
    if (!session) return
    setBusy('record')
    try {
      const result = await recordClosing(session.wallet, url, session.identityKey, desk)
      setHintTxid(result.txid)
      if (desk.open) goToClosing(desk.open.closingId, result.txid)
      setActionError(result.overlayError ?? null)
    } catch (err) {
      console.error('Record closing failed', err)
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (open) clearDesk(open.closingId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHintTxid('')
    setActionError(null)
    setActionNeedsInstall(false)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!open) return
    try {
      await navigator.clipboard.writeText(closingPublicUrl(open.closingId, hintTxid))
      setCopied(true)
    } catch (err) {
      fail(err)
    }
  }

  const combinedError = actionError || walletError

  return (
    <div className="table-scene">
      <div className={`scene-crop ${open ? 'sliver' : 'hero'}`}>
        <img
          className="scene"
          src={`${import.meta.env.BASE_URL}scene.webp`}
          alt="A closing clerk at a table, with a deed and an indigo seal."
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

          {!open && (
            <section className="block">
              <p className="job">{OPEN_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="label">What you’re closing</label>
                  <input id="label" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="amount">{AMOUNT_LABEL}</label>
                    <input
                      id="amount"
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="fee-bps">{LINE_BPS}</label>
                    <input
                      id="fee-bps"
                      inputMode="numeric"
                      value={feeBps}
                      onChange={(event) => setFeeBps(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="seller">Seller</label>
                    <input id="seller" value={seller} maxLength={40} onChange={(event) => setSeller(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="amendment">Amendment fee</label>
                    <input
                      id="amendment"
                      inputMode="numeric"
                      value={amendment}
                      onChange={(event) => setAmendment(event.target.value)}
                    />
                  </div>
                </div>
                <label className="check" htmlFor="agent-toggle">
                  <input
                    id="agent-toggle"
                    type="checkbox"
                    checked={includeAgent}
                    onChange={(event) => setIncludeAgent(event.target.checked)}
                  />
                  Include a closing agent
                </label>
                {includeAgent && (
                  <div className="field">
                    <label htmlFor="agent">Closing agent</label>
                    <input id="agent" value={agent} maxLength={40} onChange={(event) => setAgent(event.target.value)} />
                  </div>
                )}
                <div>
                  <p className="fine">{PARTIES_HEADING}</p>
                  <ul className="parties">
                    <li>{BUYER_NAME}</li>
                    <li>{seller.trim() || SELLER_NAME}</li>
                    {includeAgent && <li>{agent.trim() || AGENT_NAME}</li>}
                  </ul>
                </div>
              </div>
              <p className="helper">{PAYEE_HELPER}</p>
              {preview && <FeeTable lines={preview} showAmendment={false} />}
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runOpen}>
                  {OPEN_BUTTON}
                </button>
              </div>
            </section>
          )}

          {open && lines && (
            <section className="block">
              <div className="show-hero">
                <span className={`stamp ${desk.released ? 'released' : payeeChanged(open) ? 'flagged' : 'bound'}`}>{stampFor(desk)}</span>
                {desk.released && payeeChanged(open) && <span className="stamp flagged">{STAMP_CHANGED}</span>}
              </div>
              <h2>{open.label}</h2>
              <dl className="meta">
                <div>
                  <dt>Payee</dt>
                  <dd id="bound-payee">{open.payeeName}</dd>
                </div>
                {payeeChanged(open) && (
                  <div>
                    <dt>Flag</dt>
                    <dd className="payee-flag" id="payee-change-flag">{payeeFlagLine(open.originalPayeeName, open.payeeName)}</dd>
                  </div>
                )}
                <div>
                  <dt>{PARTIES_HEADING}</dt>
                  <dd>{parties.map((party) => party.name).join(', ')}</dd>
                </div>
                {desk.released && (
                  <div>
                    <dt>Released</dt>
                    <dd>{formatWhen(desk.released.releasedAt)}</dd>
                  </div>
                )}
              </dl>
              <p className="helper">{open.threshold} of {parties.length} have to say yes.</p>
              <FeeTable lines={lines} showAmendment={lines.amendmentFeeSats > 0} />
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn" onClick={startOver}>Start over</button>
              </div>
            </section>
          )}

          {open && !readonly && !desk.released && (
            <section className="slip">
              <p className="job">{DEED_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="deed-file">Deed file</label>
                  <input
                    id="deed-file"
                    type="file"
                    onChange={(event) => setDeedFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="deed-text">Or paste the deed text</label>
                  <textarea
                    id="deed-text"
                    rows={3}
                    value={deedText}
                    onChange={(event) => setDeedText(event.target.value)}
                  />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void runAttach()}>
                  {busy === 'attach' ? ATTACHING_BUTTON : ATTACH_BUTTON}
                </button>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void runCheck()}>
                  {CHECK_BUTTON}
                </button>
                <button type="button" className="btn" disabled={busy !== null} onClick={runAttest}>
                  {ATTEST_BUTTON}
                </button>
              </div>
              {desk.deed && (
                <p className={desk.hashStatus === 'match' ? 'status ok' : 'status err'}>
                  {desk.hashStatus === 'match' ? HASH_MATCH : HASH_MISMATCH}
                </p>
              )}
              {desk.attestation && (
                <p className={attestationMatches(desk.attestation) && desk.hashStatus === 'match' ? 'status ok' : 'status err'}>
                  {attestationMatches(desk.attestation) && desk.hashStatus === 'match' ? ATTEST_MATCH : ATTEST_MISMATCH}
                </p>
              )}
            </section>
          )}

          {open && readonly && desk.deed && (
            <section className="slip">
              <p className="job">{DEED_JOB}</p>
              <p className="status ok">{HASH_MATCH}</p>
              {desk.attestation && <p className="status ok">{ATTEST_MATCH}</p>}
            </section>
          )}

          {open && !readonly && !desk.released && (
            <section className="slip">
              <p className="job">{SWAP_JOB}</p>
              <div className="field">
                <label htmlFor="new-payee">New payee</label>
                <input id="new-payee" value={proposed} maxLength={40} onChange={(event) => setProposed(event.target.value)} />
              </div>
              <div className="actions">
                <button type="button" className="btn danger" disabled={busy !== null} onClick={runSwap}>
                  {SWAP_BUTTON}
                </button>
              </div>
              {desk.rejection === SWAP_REJECTED && <p className="status err" role="alert">{SWAP_REJECTED}</p>}
              {desk.rejection === ALREADY_PAYEE && <p className="status err" role="alert">{ALREADY_PAYEE}</p>}
              {desk.rejection === NEED_NAME && <p className="status err" role="alert">{NEED_NAME}</p>}
              <p className="helper">{PARTY_CHANGE_HELPER}</p>
              <p className="fine">{approvalLine(desk.payeeApprovals.length, open.threshold)}</p>
              <div className="actions">
                {parties.map((party) => (
                  <button
                    key={`payee-${party.role}`}
                    type="button"
                    className="btn"
                    disabled={!desk.proposal || desk.payeeApprovals.includes(party.role)}
                    onClick={() => runApprove('payee', party.role)}
                  >
                    {desk.payeeApprovals.includes(party.role) ? `${party.name} approved` : `Approve as ${party.name}`}
                  </button>
                ))}
              </div>
            </section>
          )}

          {open && !readonly && (
            <section className="slip">
              <p className="job">{RELEASE_JOB}</p>
              <p className="fine">{approvalLine(desk.releaseApprovals.length, open.threshold)}</p>
              {!desk.released && (
                <div className="actions">
                  {parties.map((party) => (
                    <button
                      key={`release-${party.role}`}
                      type="button"
                      className="btn"
                      disabled={desk.releaseApprovals.includes(party.role)}
                      onClick={() => runApprove('release', party.role)}
                    >
                      {desk.releaseApprovals.includes(party.role) ? `${party.name} approved` : `Approve release as ${party.name}`}
                    </button>
                  ))}
                </div>
              )}
              {!desk.released && blocked && <p className="helper">{blocked}</p>}
              {!desk.released && (
                <div className="actions">
                  <button type="button" className="btn primary" disabled={Boolean(blocked) || busy !== null} onClick={runRelease}>
                    {RELEASE_BUTTON}
                  </button>
                </div>
              )}
              {desk.released && lines && <FeeTable lines={lines} showAmendment={lines.amendmentFeeSats > 0} />}
            </section>
          )}

          {open && !readonly && desk.released && (
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

          {desk.notice && <p className="status ok">{desk.notice}</p>}
          {combinedError && desk.rejection !== combinedError && <p className="status err">{combinedError}</p>}
          {desk.rejection && desk.rejection !== SWAP_REJECTED && desk.rejection !== ALREADY_PAYEE && desk.rejection !== NEED_NAME && (
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
          <p>The fee is {feeBps || '100'} basis points of the closing amount. 100 is 1%.</p>
          <p>{LOCAL_ROLES_NOTE}</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {open && <p>Closing id <code>{open.closingId}</code></p>}
          {hintTxid && <p>Transaction <code>{hintTxid}</code></p>}
          {open && <p>Payee key <code>{shortKey(open.payeeIdentity, 8)}</code></p>}
          {open && <p>Buyer key <code>{shortKey(open.buyerIdentity, 8)}</code></p>}
          {open?.agentIdentity && <p>Agent key <code>{shortKey(open.agentIdentity, 8)}</code></p>}
          {desk.deed && <p>Deed hash <code>{desk.deed.docHash}</code></p>}
          {desk.attestation && <p>Attestation <code>{desk.attestation.attestation}</code></p>}
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
