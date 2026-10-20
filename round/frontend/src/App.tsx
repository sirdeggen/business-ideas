import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CERT_FIELDS,
  SAMPLE_CERTIFIER,
  allocateRound,
  closeRound,
  commitToRound,
  disclose,
  emptyDesk,
  handoffJson,
  identityFor,
  isIdentityKey,
  newNonce,
  nowIso,
  openRound,
  parseCloseLines,
  type DeskState,
  type OrgKind,
  type Pricing
} from '../../protocol/round'
import { BusinessCase } from './BusinessCase'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import { parseWhole, recordRound } from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  isWalletMissing,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import {
  BACKER_LABEL,
  BID_LABEL,
  BOOK_EMPTY,
  BOOK_HEADING,
  CERTIFIER_LABEL,
  CLOSE_BUTTON,
  CLOSE_JOB,
  COMMIT_BUTTON,
  COMMIT_JOB,
  DEADLINE_LABEL,
  DESK_NOTE,
  DISCLOSE_BUTTON,
  DISCLOSE_JOB,
  EYEBROW,
  FOOTER,
  HANDOFF_BUTTON,
  HANDOFF_JOB,
  LEDE,
  LOCAL_NOTE,
  MAX_LABEL,
  MIN_LABEL,
  NAME_LABEL,
  OPEN_BUTTON,
  OPEN_JOB,
  ORG_LABEL,
  PRICE_LABEL,
  PRICING_LABEL,
  RECORD_BUTTON,
  RECORD_JOB,
  RECORDING_BUTTON,
  REFRESH_BUTTON,
  SATS_LABEL,
  SCENE_ALT,
  SCRIPT_NOTE,
  SERIAL_LABEL,
  STRANGER_LINE,
  TITLE,
  TYPE_LABEL,
  UNIT_LABEL,
  formatAmount,
  orgLabel,
  pricingLabel
} from './lib/copy'
import { bookFromItems, lookupRound, lookupRoundItems } from './lib/overlay'
import { clearDesk, loadDesk, saveDesk } from './lib/persist'
import { goHome, goToRound, readRoundFromLocation, roundHref, roundPublicUrl } from './lib/route'

type Busy = 'record' | null

function defaultDeadline(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIso(local: string): string {
  const date = new Date(local)
  if (Number.isNaN(date.getTime())) throw new Error('Enter a deadline.')
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, walletMissing, connect } = useWallet()
  const initial = useMemo(() => readRoundFromLocation(), [])

  const [desk, setDesk] = useState<DeskState>(emptyDesk())
  const [readonly, setReadonly] = useState(false)
  const [hintTxid, setHintTxid] = useState(initial.hintTxid ?? '')
  const [pinIdentity, setPinIdentity] = useState(initial.pinIdentity ?? '')
  const [name, setName] = useState('Harbor Co-op')
  const [orgKind, setOrgKind] = useState<OrgKind>('coop')
  const [pricing, setPricing] = useState<Pricing>('fixed')
  const [unitLabel, setUnitLabel] = useState('units')
  const [price, setPrice] = useState('1000')
  const [minimum, setMinimum] = useState('3000')
  const [maximum, setMaximum] = useState('10000')
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [required, setRequired] = useState<Record<string, boolean>>({
    jurisdiction: true,
    member: true,
    accredited: false,
    residency: false
  })
  const [backer, setBacker] = useState('Ada')
  const [backerKey, setBackerKey] = useState('')
  const [certifier, setCertifier] = useState(SAMPLE_CERTIFIER)
  const [certificateType, setCertificateType] = useState('membership')
  const [serial, setSerial] = useState('serial-1')
  const [fields, setFields] = useState<Record<string, string>>({ jurisdiction: 'CA', member: 'yes' })
  const [sats, setSats] = useState('5000')
  const [bid, setBid] = useState('1000')
  const [book, setBook] = useState<ReturnType<typeof bookFromItems>>([])
  const [bookError, setBookError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNeedsInstall, setActionNeedsInstall] = useState(false)
  const [copied, setCopied] = useState(false)
  const [handoff, setHandoff] = useState('')
  const installRef = useRef<HTMLDivElement>(null)

  const showInstall = walletMissing || actionNeedsInstall
  const terms = desk.terms
  const backerIdentity = isIdentityKey(backerKey) ? backerKey.trim().toLowerCase() : identityFor(backer || 'backer')
  const asked = CERT_FIELDS.filter((field) => required[field])

  const preview = useMemo(() => {
    if (!terms || desk.commits.length < 1) return null
    return allocateRound(terms, desk.commits, desk.eligibilities, nowIso())
  }, [terms, desk.commits, desk.eligibilities])

  useEffect(() => {
    if (!showInstall) return
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showInstall])

  useEffect(() => {
    if (!terms || readonly) return
    saveDesk(terms.roundId, desk)
  }, [desk, terms, readonly])

  const refreshBook = (): void => {
    void lookupRoundItems(url)
      .then((items) => {
        setBook(bookFromItems(items, pinIdentity || null))
        setBookError(null)
      })
      .catch(() => setBookError('The public book didn’t load.'))
  }

  useEffect(() => {
    refreshBook()
  }, [url, pinIdentity])

  useEffect(() => {
    const located = readRoundFromLocation()
    if (located.pinIdentity) setPinIdentity(located.pinIdentity)
    if (!located.roundId) return
    const local = loadDesk(located.roundId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    let cancel = false
    void lookupRound(url, located.roundId, located.hintTxid ?? undefined, located.pinIdentity || undefined)
      .then((remote) => {
        if (cancel || !remote?.terms) return
        setDesk(remote)
        setReadonly(true)
        if (remote.close && remote.terms) setHandoff(handoffJson(remote.terms, remote.close))
      })
      .catch(() => {
        if (!cancel) setActionError('This raise wasn’t found.')
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

  const apply = (next: DeskState): void => {
    setDesk(next)
    setActionError(next.rejection)
  }

  const runOpen = (): void => {
    setActionError(null)
    try {
      const priceSats = parseWhole(price)
      const minSats = parseWhole(minimum)
      const maxSats = parseWhole(maximum)
      if (priceSats == null || minSats == null || maxSats == null) throw new Error('Enter amounts in sats.')
      if (asked.length < 1) throw new Error('Pick at least one certificate field.')
      const next = openRound({
        name,
        orgKind,
        pricing,
        unitLabel,
        priceSats,
        minSats,
        maxSats,
        deadline: toIso(deadline),
        requiredFields: asked
      }, nowIso(), newNonce())
      setDesk(next)
      setReadonly(false)
      setHandoff('')
      if (next.terms) goToRound(next.terms.roundId)
    } catch (err) {
      fail(err)
    }
  }

  const runDisclose = (): void => {
    setActionError(null)
    const values: Record<string, string> = {}
    for (const field of asked) values[field] = fields[field] ?? ''
    apply(disclose(desk, {
      backerKey: backerIdentity,
      certifierKey: certifier,
      certificateType,
      serialNumber: serial,
      fields: values
    }, nowIso()))
  }

  const runCommit = (): void => {
    setActionError(null)
    const amount = parseWhole(sats)
    const bidPrice = parseWhole(bid)
    if (amount == null) {
      setActionError('Enter an amount in sats.')
      return
    }
    apply(commitToRound(desk, {
      backerKey: backerIdentity,
      sats: amount,
      bidPriceSats: bidPrice ?? undefined
    }, nowIso(), newNonce()))
  }

  const runClose = (): void => {
    setActionError(null)
    const next = closeRound(desk, nowIso())
    apply(next)
    if (next.terms && next.close) setHandoff(handoffJson(next.terms, next.close))
  }

  const runRecord = async (): Promise<void> => {
    setActionError(null)
    setActionNeedsInstall(false)
    setBusy('record')
    try {
      const session = await ensureWallet()
      if (!session) {
        setActionNeedsInstall(walletMissing)
        return
      }
      const result = await recordRound(session.wallet, url, session.identityKey, desk)
      setDesk(result.desk)
      setHintTxid(result.txid)
      goToRound(result.roundId, result.txid, result.issuerKey)
      if (result.overlayError) setActionError(result.overlayError)
      else if (result.payoutNote) setActionError(result.payoutNote)
      refreshBook()
    } catch (err) {
      setActionError(errorMessage(err))
      setActionNeedsInstall(isWalletMissing(err))
    } finally {
      setBusy(null)
    }
  }

  const startOver = (): void => {
    if (terms) clearDesk(terms.roundId)
    setDesk(emptyDesk())
    setReadonly(false)
    setHandoff('')
    setHintTxid('')
    setActionError(null)
    goHome()
  }

  const copyLink = async (): Promise<void> => {
    if (!terms) return
    await navigator.clipboard.writeText(roundPublicUrl(terms.roundId, hintTxid || null, terms.issuerKey))
    setCopied(true)
  }

  const downloadHandoff = (): void => {
    if (!handoff || !terms) return
    const blob = new Blob([handoff], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${terms.name.replace(/\s+/g, '-').toLowerCase()}-handoff.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const openListed = (roundId: string, txid: string | null, issuer: string): void => {
    goToRound(roundId, txid, issuer)
    const local = loadDesk(roundId)
    if (local) {
      setDesk(local)
      setReadonly(false)
      return
    }
    void lookupRound(url, roundId, txid ?? undefined, issuer).then((remote) => {
      if (!remote?.terms) return
      setDesk(remote)
      setReadonly(true)
      if (remote.close) setHandoff(handoffJson(remote.terms, remote.close))
    }).catch(() => setActionError('This raise wasn’t found.'))
  }

  const lines = desk.close ? parseCloseLines(desk.close.lines) : preview?.lines ?? null
  const combinedError = actionError || walletError

  return (
    <div className="table-scene">
      <div className={`scene-crop ${terms ? 'sliver' : 'hero'}`}>
        <img className="scene" src={`${import.meta.env.BASE_URL}scene.webp`} alt={SCENE_ALT} />
      </div>
      <div className="app">
        <article className="sheet">
          <header className="sheet-head">
            <p className="eyebrow">{EYEBROW}</p>
            <h1>{TITLE}</h1>
            <p className="lede">{LEDE}</p>
          </header>

          <BusinessCase />
          <p className="receipt-note">{SCRIPT_NOTE}</p>
          <p className="receipt-note">{DESK_NOTE}</p>

          {!terms && (
            <section className="block">
              <p className="job">{OPEN_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="raise-name">{NAME_LABEL}</label>
                  <input id="raise-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="org-kind">{ORG_LABEL}</label>
                    <select id="org-kind" value={orgKind} onChange={(event) => setOrgKind(event.target.value as OrgKind)}>
                      <option value="business">Business</option>
                      <option value="coop">Co-op</option>
                      <option value="startup">Startup</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pricing">{PRICING_LABEL}</label>
                    <select id="pricing" value={pricing} onChange={(event) => setPricing(event.target.value as Pricing)}>
                      <option value="fixed">Fixed price</option>
                      <option value="clearing">Clearing-price auction</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="unit-label">{UNIT_LABEL}</label>
                  <input id="unit-label" value={unitLabel} maxLength={24} onChange={(event) => setUnitLabel(event.target.value)} />
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="price">{PRICE_LABEL}</label>
                    <input id="price" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="deadline">{DEADLINE_LABEL}</label>
                    <input id="deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                  </div>
                </div>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="minimum">{MIN_LABEL}</label>
                    <input id="minimum" inputMode="numeric" value={minimum} onChange={(event) => setMinimum(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="maximum">{MAX_LABEL}</label>
                    <input id="maximum" inputMode="numeric" value={maximum} onChange={(event) => setMaximum(event.target.value)} />
                  </div>
                </div>
                <fieldset className="field">
                  <legend>Fields the raise asks for</legend>
                  {CERT_FIELDS.map((field) => (
                    <label key={field} className="check">
                      <input
                        type="checkbox"
                        checked={required[field]}
                        onChange={(event) => setRequired({ ...required, [field]: event.target.checked })}
                      />
                      {field}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runOpen}>
                  {OPEN_BUTTON}
                </button>
              </div>
            </section>
          )}

          {terms && (
            <section className="block">
              <h2>{terms.name}</h2>
              <p className="job">{orgLabel(terms.orgKind)} · {pricingLabel(terms.pricing)} · {terms.unitLabel}</p>
              <dl className="fees">
                <div><dt>Minimum</dt><dd>{formatAmount(terms.minSats)}</dd></div>
                <div><dt>Maximum</dt><dd>{formatAmount(terms.maxSats)}</dd></div>
                <div><dt>{terms.pricing === 'clearing' ? 'Reserve' : 'Price'}</dt><dd>{formatAmount(terms.priceSats)}</dd></div>
                <div><dt>Asks for</dt><dd>{terms.requiredFields}</dd></div>
              </dl>
              <p className="helper">{STRANGER_LINE}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy link'}</button>
                {!readonly && <button type="button" className="btn" onClick={startOver}>Start over</button>}
              </div>
            </section>
          )}

          {terms && !desk.close && !readonly && (
            <section className="slip" id="eligibility">
              <p className="job">{DISCLOSE_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="backer">{BACKER_LABEL}</label>
                  <input id="backer" value={backer} maxLength={80} onChange={(event) => setBacker(event.target.value)} />
                </div>
                {asked.map((field) => (
                  <div className="field" key={field}>
                    <label htmlFor={`field-${field}`}>{field}</label>
                    <input
                      id={`field-${field}`}
                      value={fields[field] ?? ''}
                      maxLength={80}
                      onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runDisclose}>
                  {DISCLOSE_BUTTON}
                </button>
              </div>
              {desk.eligibilities.length > 0 && (
                <ul className="receipts">
                  {desk.eligibilities.map((row) => (
                    <li key={row.backerKey}><code>{row.disclosed}</code></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {terms && desk.eligibilities.length > 0 && !desk.close && !readonly && (
            <section className="slip" id="escrow">
              <p className="job">{COMMIT_JOB}</p>
              <div className="fields">
                <div className="field">
                  <label htmlFor="sats">{SATS_LABEL}</label>
                  <input id="sats" inputMode="numeric" value={sats} onChange={(event) => setSats(event.target.value)} />
                </div>
                {terms.pricing === 'clearing' && (
                  <div className="field">
                    <label htmlFor="bid">{BID_LABEL}</label>
                    <input id="bid" inputMode="numeric" value={bid} onChange={(event) => setBid(event.target.value)} />
                  </div>
                )}
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={runCommit}>
                  {COMMIT_BUTTON}
                </button>
              </div>
              {desk.commits.length > 0 && (
                <ul className="receipts">
                  {desk.commits.map((row) => (
                    <li key={row.commitId}>{formatAmount(row.sats)} sats · bid {formatAmount(row.bidPriceSats)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {terms && desk.commits.length > 0 && (
            <section className="slip" id="close-result">
              <p className="job">{CLOSE_JOB}</p>
              {lines && lines.length > 0 && (
                <ul className="receipts">
                  {lines.map((line) => (
                    <li key={line.commitId}>
                      {formatAmount(line.committedSats)} committed · {line.units} {terms.unitLabel} · refund {formatAmount(line.refundSats)}
                    </li>
                  ))}
                </ul>
              )}
              {preview?.outcome === 'open' && !desk.close && <p className="helper">Still under the minimum. It stays open until the deadline, then every backer is refunded.</p>}
              {desk.close?.outcome === 'refund' && <p className="status ok">Under the minimum. Every backer is refunded.</p>}
              {desk.close?.outcome === 'settled' && <p className="status ok">Settled at {formatAmount(desk.close.clearingPriceSats)} sats per unit.</p>}
              {!desk.close && !readonly && (
                <div className="actions">
                  <button type="button" className="btn primary" disabled={busy !== null} onClick={runClose}>
                    {CLOSE_BUTTON}
                  </button>
                </div>
              )}
            </section>
          )}

          {terms && desk.close && (
            <section className="slip" id="handoff">
              <p className="job">{HANDOFF_JOB}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={downloadHandoff}>{HANDOFF_BUTTON}</button>
              </div>
              {handoff && <pre>{handoff}</pre>}
            </section>
          )}

          {terms && !readonly && (
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
            <div className="actions">
              <button type="button" className="btn" onClick={refreshBook}>{REFRESH_BUTTON}</button>
            </div>
            {bookError && <p className="helper">{bookError}</p>}
            {book.length === 0 && !bookError && <p className="helper">{BOOK_EMPTY}</p>}
            {book.length > 0 && (
              <ul className="receipts">
                {book.map((row) => (
                  <li key={row.roundId}>
                    <a
                      className="text-btn"
                      href={roundHref(row.roundId, row.txid, row.terms.issuerKey)}
                      onClick={(event) => {
                        event.preventDefault()
                        openListed(row.roundId, row.txid, row.terms.issuerKey)
                      }}
                    >
                      {row.terms.name}
                    </a>
                    <span> · {row.outcome} · {formatAmount(row.qualifiedSats)} sats</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {combinedError && <p className="status err">{combinedError}</p>}
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
          <summary>How it works</summary>
          <p>{LOCAL_NOTE}</p>
        </details>

        <details className="advanced">
          <summary>Advanced</summary>
          <p>Amounts are in sats. The public book is the overlay record of this raise.</p>
          {online === false && <p>{overlayCheckFailed(probeError, url)}</p>}
          {identityKey && <p>Wallet key <code>{shortKey(identityKey, 8)}</code></p>}
          {terms && <p>Round id <code>{terms.roundId}</code></p>}
          <label htmlFor="backer-key">{BACKER_LABEL} key</label>
          <input id="backer-key" value={backerKey} onChange={(event) => setBackerKey(event.target.value)} placeholder="Compressed public key, or leave blank" />
          <label htmlFor="certifier">{CERTIFIER_LABEL}</label>
          <input id="certifier" value={certifier} onChange={(event) => setCertifier(event.target.value)} />
          <label htmlFor="certificate-type">{TYPE_LABEL}</label>
          <input id="certificate-type" value={certificateType} onChange={(event) => setCertificateType(event.target.value)} />
          <label htmlFor="serial">{SERIAL_LABEL}</label>
          <input id="serial" value={serial} onChange={(event) => setSerial(event.target.value)} />
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
