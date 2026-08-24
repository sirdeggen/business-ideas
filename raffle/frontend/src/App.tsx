import { useEffect, useMemo, useState } from 'react'
import {
  liveTickets,
  remainingCount
} from '../../protocol/raffle'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  acceptPass,
  assertHostCanDraw,
  claimTicket,
  drawWinner,
  listHeldTickets,
  passTicket,
  startRaffle,
  type HeldTicket
} from './lib/actions'
import {
  CHROME_ALLOW_HINT,
  DESKTOP_INSTALL_URL,
  errorMessage,
  overlayCheckFailed,
  shortKey
} from './lib/config'
import { lookupRaffle, type OverlayDraw, type OverlayHeader, type OverlayTicket } from './lib/overlay'

function raffleIdFromUrl(): string {
  if (typeof window === 'undefined') return ''
  return (new URLSearchParams(window.location.search).get('r') ?? '').trim()
}

function shareUrl(raffleId: string): string {
  if (typeof window === 'undefined') return `?r=${raffleId}`
  const url = new URL(window.location.href)
  url.search = `?r=${raffleId}`
  return url.toString()
}

function goToRaffle(raffleId: string): void {
  const url = shareUrl(raffleId)
  window.history.replaceState({}, '', url)
}

function winnerLine(tickets: OverlayTicket[], winningIndex: number): string {
  const ticket = tickets.find((item) => item.ticketIndex === winningIndex)
  if (!ticket) return `Ticket ${winningIndex}`
  return `Ticket ${ticket.ticketIndex}`
}

function Shell() {
  const { url, setUrl, online, probeError } = useOverlay()
  const { wallet, identityKey, connecting, error: walletError, connect } = useWallet()

  const [raffleId, setRaffleId] = useState(() => raffleIdFromUrl())
  const [header, setHeader] = useState<OverlayHeader | null>(null)
  const [tickets, setTickets] = useState<OverlayTicket[]>([])
  const [draws, setDraws] = useState<OverlayDraw[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [title, setTitle] = useState('Friday offsite')
  const [whoCanEnter, setWhoCanEnter] = useState('Anyone at the offsite')
  const [ticketCount, setTicketCount] = useState(20)
  const [transferable, setTransferable] = useState(true)
  const [drawNote, setDrawNote] = useState('After lunch')
  const [terms, setTerms] = useState('')

  const [passTo, setPassTo] = useState('')
  const [held, setHeld] = useState<HeldTicket[]>([])

  const [busy, setBusy] = useState<'start' | 'claim' | 'pass' | 'draw' | 'receive' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<'start' | 'claim' | 'pass' | 'draw' | 'receive'>('start')

  const overlayDown = online === false
  const remaining = header ? remainingCount(header, tickets) : 0
  const live = header ? liveTickets(tickets, draws) as OverlayTicket[] : []
  const drawn = draws[0] ?? null
  const isHost = Boolean(identityKey && header && identityKey === header.host)
  const myTickets = useMemo(() => {
    if (!identityKey) return [] as OverlayTicket[]
    return live.filter((ticket) => ticket.holder === identityKey)
  }, [identityKey, live])
  const incoming = useMemo(() => {
    if (!identityKey) return [] as OverlayTicket[]
    return tickets.filter((ticket) => (
      ticket.holder === identityKey && ticket.keyID && ticket.sender && ticket.beef
    ))
  }, [identityKey, tickets])
  const heldHere = held.find((item) => item.ticket.raffleId === raffleId)

  const refresh = async (id = raffleId): Promise<void> => {
    if (!id) {
      setHeader(null)
      setTickets([])
      setDraws([])
      setListError(null)
      return
    }
    setListBusy(true)
    setListError(null)
    try {
      const view = await lookupRaffle(url, id)
      setHeader(view.header)
      setTickets(view.tickets)
      setDraws(view.draws)
      if (!view.header) setListError('No raffle in this link.')
    } catch (err) {
      console.error('Lookup failed', err)
      setListError(errorMessage(err))
    } finally {
      setListBusy(false)
    }
  }

  const refreshHeld = async (active = wallet): Promise<void> => {
    if (!active) {
      setHeld([])
      return
    }
    try {
      setHeld(await listHeldTickets(active))
    } catch (err) {
      console.error('Basket list failed', err)
    }
  }

  useEffect(() => {
    void refresh()
  }, [url, raffleId])

  useEffect(() => {
    void refreshHeld()
  }, [wallet])

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    const result = await connect()
    if (!result) return null
    return result
  }

  const runStart = async (): Promise<void> => {
    setLastAction('start')
    setActionError(null)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('start')
    try {
      const result = await startRaffle(session.wallet, url, session.identityKey, {
        title,
        whoCanEnter,
        ticketCount,
        transferable,
        drawNote,
        terms
      })
      setRaffleId(result.raffleId)
      goToRaffle(result.raffleId)
      setStatus(result.overlayError
        ? `Started in wallet. Overlay submit failed: ${result.overlayError}`
        : 'Raffle started. Share the link.')
      if (result.overlayError) setActionError(result.overlayError)
      await refresh(result.raffleId)
    } catch (err) {
      console.error('Start failed', err)
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const runClaim = async (): Promise<void> => {
    if (!header) return
    setLastAction('claim')
    setActionError(null)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    setBusy('claim')
    try {
      const result = await claimTicket(session.wallet, url, session.identityKey, header, tickets)
      setStatus(result.overlayError
        ? `Claimed ticket ${result.ticketIndex}. Overlay submit failed: ${result.overlayError}`
        : `You have ticket ${result.ticketIndex}.`)
      if (result.overlayError) setActionError(result.overlayError)
      await refresh()
      await refreshHeld(session.wallet)
    } catch (err) {
      console.error('Claim failed', err)
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const runPass = async (): Promise<void> => {
    if (!header) return
    setLastAction('pass')
    setActionError(null)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    const mine = held.find((item) => item.ticket.raffleId === header.raffleId)
      ?? held.find((item) => myTickets.some((ticket) => ticket.ticketIndex === item.ticket.ticketIndex))
    if (!mine) {
      setActionError('You need a ticket in this wallet before you can pass one.')
      return
    }
    setBusy('pass')
    try {
      const result = await passTicket(session.wallet, url, mine, session.identityKey, passTo.trim())
      setStatus(result.overlayError
        ? `Passed ticket ${result.ticketIndex}. Overlay submit failed: ${result.overlayError}`
        : `Passed ticket ${result.ticketIndex}.`)
      if (result.overlayError) setActionError(result.overlayError)
      setPassTo('')
      await refresh()
      await refreshHeld(session.wallet)
    } catch (err) {
      console.error('Pass failed', err)
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const runDraw = async (): Promise<void> => {
    if (!header) return
    setLastAction('draw')
    setActionError(null)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    try {
      assertHostCanDraw(header.host, session.identityKey)
    } catch (err) {
      setActionError(errorMessage(err))
      return
    }
    setBusy('draw')
    try {
      const result = await drawWinner(session.wallet, url, session.identityKey, header, tickets, draws)
      setStatus(result.overlayError
        ? `Drew ticket ${result.winningIndex}. Overlay submit failed: ${result.overlayError}`
        : `Ticket ${result.winningIndex} won.`)
      if (result.overlayError) setActionError(result.overlayError)
      await refresh()
    } catch (err) {
      console.error('Draw failed', err)
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const runReceive = async (ticket: OverlayTicket): Promise<void> => {
    setLastAction('receive')
    setActionError(null)
    setStatus(null)
    const session = await ensureWallet()
    if (!session) return
    if (!ticket.beef) {
      setActionError('This pass is missing the ticket transaction.')
      return
    }
    setBusy('receive')
    try {
      await acceptPass(session.wallet, ticket.beef, ticket)
      setStatus(`Received ticket ${ticket.ticketIndex}.`)
      await refreshHeld(session.wallet)
    } catch (err) {
      console.error('Receive failed', err)
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const retry = (): void => {
    if (lastAction === 'claim') void runClaim()
    else if (lastAction === 'pass') void runPass()
    else if (lastAction === 'draw') void runDraw()
    else if (lastAction === 'receive') {
      const ticket = incoming[0]
      if (ticket) void runReceive(ticket)
    } else void runStart()
  }

  const combinedError = actionError || walletError
  const showInstall = Boolean(combinedError) && !overlayDown

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">Raffle</p>
          <h1>{header ? header.title : 'Start a raffle'}</h1>
          <p className="lede">
            {header
              ? header.drawNote || 'Pass a ticket. Draw a winner.'
              : 'Start a raffle. Pass a ticket. Draw a winner.'}
          </p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}

        {!raffleId && (
          <section className="block">
            <h2>Start</h2>
            <p className="job">Name what it’s for. Say who can enter. Then share the link.</p>
            <div className="fields">
              <div className="field">
                <label htmlFor="title">What’s it for?</label>
                <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="who">Who can enter</label>
                <input id="who" value={whoCanEnter} onChange={(event) => setWhoCanEnter(event.target.value)} />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="count">How many tickets</label>
                  <input
                    id="count"
                    type="number"
                    min={1}
                    max={100}
                    value={ticketCount}
                    onChange={(event) => setTicketCount(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="when">When we draw</label>
                  <input id="when" value={drawNote} onChange={(event) => setDrawNote(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="terms">Short terms (optional)</label>
                <textarea id="terms" rows={3} value={terms} onChange={(event) => setTerms(event.target.value)} />
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={transferable}
                  onChange={(event) => setTransferable(event.target.checked)}
                />
                Tickets can be passed
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown}
                onClick={() => void runStart()}
              >
                {busy === 'start' ? 'Starting…' : connecting ? 'Connecting…' : 'Start'}
              </button>
            </div>
          </section>
        )}

        {raffleId && !header && !listBusy && (
          <p className="empty">{listError || 'No raffle in this link.'}</p>
        )}

        {header && (
          <section className="slip">
            <div className="section-head">
              <h2>{drawn ? 'Winner' : 'The raffle'}</h2>
              <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                {listBusy ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <dl className="meta">
              <div>
                <dt>Prize</dt>
                <dd>{header.title}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd className="count">{drawn ? 'Drawn' : `${remaining} of ${header.ticketCount}`}</dd>
              </div>
              <div>
                <dt>Who can enter</dt>
                <dd>{header.whoCanEnter || 'Anyone at the offsite'}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{header.drawNote || 'When the host draws'}</dd>
              </div>
            </dl>
            {header.terms && <p className="helper">{header.terms}</p>}
            {drawn && (
              <p className="status ok">
                <span className="count">{winnerLine(tickets, drawn.winningIndex)}</span> won.
              </p>
            )}
            {myTickets.length > 0 && (
              <p className="helper">
                You hold ticket{' '}
                <span className="count">{myTickets.map((ticket) => ticket.ticketIndex).join(', ')}</span>.
              </p>
            )}

            <div className="actions">
              {!drawn && remaining > 0 && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown}
                  onClick={() => void runClaim()}
                >
                  {busy === 'claim' ? 'Claiming…' : connecting ? 'Connecting…' : 'Claim'}
                </button>
              )}
              {isHost && !drawn && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null || connecting || overlayDown || live.length === 0}
                  onClick={() => void runDraw()}
                >
                  {busy === 'draw' ? 'Drawing…' : 'Draw'}
                </button>
              )}
            </div>

            {header.transferable && !drawn && (
              <div className="fields pass">
                <h2>Pass</h2>
                <p className="job">Send your ticket to a coworker, or share the claim link.</p>
                <div className="field">
                  <label htmlFor="pass">Their identity</label>
                  <input
                    id="pass"
                    value={passTo}
                    onChange={(event) => setPassTo(event.target.value)}
                    placeholder="Paste their identity"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || connecting || overlayDown || !passTo.trim() || (!heldHere && myTickets.length === 0)}
                    onClick={() => void runPass()}
                  >
                    {busy === 'pass' ? 'Passing…' : 'Pass'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void navigator.clipboard.writeText(shareUrl(header.raffleId))}
                  >
                    Copy claim link
                  </button>
                </div>
              </div>
            )}

            {incoming.length > 0 && (
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting}
                  onClick={() => void runReceive(incoming[0])}
                >
                  {busy === 'receive' ? 'Receiving…' : `Receive ticket ${incoming[0].ticketIndex}`}
                </button>
              </div>
            )}

            {!header.transferable && (
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(shareUrl(header.raffleId))}
                >
                  Copy claim link
                </button>
              </div>
            )}
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
        <summary>Overlay URL</summary>
        <p>Operators can point this at a local indexer.</p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
        {identityKey && <p>You: {shortKey(identityKey)}</p>}
      </details>

      <p className="fine-print">
        Keys stay in the wallet.
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
