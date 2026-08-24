import { useEffect, useMemo, useState } from 'react'
import {
  holderAlreadyHasStub,
  hostFirstName,
  liveTickets,
  remainingCount,
  takenCount
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
  overlayCheckFailed
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

function winnerName(tickets: OverlayTicket[], drawn: OverlayDraw): string {
  if (drawn.winnerName.trim()) return drawn.winnerName.trim()
  const ticket = tickets.find((item) => item.ticketIndex === drawn.winningIndex)
  return ticket?.holderName.trim() || ''
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

  const [title, setTitle] = useState('')
  const [prize, setPrize] = useState('')
  const [whoCanEnter, setWhoCanEnter] = useState('This trip')
  const [ticketCount, setTicketCount] = useState(40)
  const [onePerPerson, setOnePerPerson] = useState(true)
  const [drawNote, setDrawNote] = useState('After dinner, when Priya says so')
  const [mustBePresent, setMustBePresent] = useState(true)
  const [hostName, setHostName] = useState('Priya')

  const [guestName, setGuestName] = useState('')
  const [passName, setPassName] = useState('')
  const [passTo, setPassTo] = useState('')
  const [held, setHeld] = useState<HeldTicket[]>([])

  const [busy, setBusy] = useState<'start' | 'claim' | 'pass' | 'draw' | 'receive' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<'start' | 'claim' | 'pass' | 'draw' | 'receive'>('start')

  const overlayDown = online === false
  const taken = header ? takenCount(header, tickets) : 0
  const remaining = header ? remainingCount(header, tickets) : 0
  const live = header ? liveTickets(tickets, draws) : []
  const drawn = draws[0] ?? null
  const isHost = Boolean(identityKey && header && identityKey === header.host)
  const canPass = Boolean(header && !header.onePerPerson)
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
  const alreadyHasStub = Boolean(identityKey && holderAlreadyHasStub(tickets, identityKey))
  const asked = header ? (hostFirstName(header.hostName) || 'Priya') : ''
  const whoLine = header
    ? (!header.whoCanEnter.trim() || header.whoCanEnter.trim() === 'This trip' || header.whoCanEnter.trim() === 'This trip only'
      ? 'This trip only'
      : header.whoCanEnter.trim())
    : ''
  const whenLine = header ? (header.drawNote.trim() || 'when Priya says so') : ''

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
        prize,
        prizeValue: '',
        whoCanEnter,
        ticketCount,
        onePerPerson,
        drawNote,
        mustBePresent,
        hostName
      })
      setRaffleId(result.raffleId)
      goToRaffle(result.raffleId)
      setStatus(result.overlayError
        ? `Started. Overlay submit failed: ${result.overlayError}`
        : 'Draw started. Share the link.')
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
    if (!guestName.trim()) {
      setActionError('Write the name that goes on the stub.')
      return
    }
    const session = await ensureWallet()
    if (!session) return
    setBusy('claim')
    try {
      const result = await claimTicket(
        session.wallet,
        url,
        session.identityKey,
        header,
        tickets,
        guestName
      )
      setStatus(result.overlayError
        ? `Took stub ${result.ticketIndex}. Overlay submit failed: ${result.overlayError}`
        : `Your stub is ${result.ticketIndex}.`)
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
      setActionError('You need a stub in this wallet before you can hand one over.')
      return
    }
    setBusy('pass')
    try {
      const result = await passTicket(
        session.wallet,
        url,
        mine,
        session.identityKey,
        passTo.trim(),
        passName
      )
      setStatus(result.overlayError
        ? `Handed stub ${result.ticketIndex}. Overlay submit failed: ${result.overlayError}`
        : `Handed stub ${result.ticketIndex} to ${passName.trim()}.`)
      if (result.overlayError) setActionError(result.overlayError)
      setPassTo('')
      setPassName('')
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
        ? `${result.winnerName} won. Overlay submit failed: ${result.overlayError}`
        : `${result.winnerName} won.`)
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
      setActionError('This stub is missing its pass.')
      return
    }
    setBusy('receive')
    try {
      await acceptPass(session.wallet, ticket.beef, ticket)
      setStatus(`Received stub ${ticket.ticketIndex}.`)
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
  const showTake = Boolean(header && !drawn && remaining > 0 && !alreadyHasStub)

  return (
    <div className="app">
      <article className="sheet">
        <header className="sheet-head">
          <p className="eyebrow">Draw</p>
          <h1>{header ? header.title : 'This trip’s draw'}</h1>
          <p className="lede">
            {header
              ? header.prize
              : 'This trip’s draw. Free stub. One winner, in the room.'}
          </p>
        </header>

        {online === false && (
          <p className="status err">
            {`${overlayCheckFailed(probeError, url)} This page is pointed at ${url}.`}
          </p>
        )}

        {!raffleId && (
          <section className="block">
            <div className="fields">
              <div className="field">
                <label htmlFor="event">Event</label>
                <input
                  id="event"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Northstar offsite, Friday dinner"
                />
              </div>
              <div className="field">
                <label htmlFor="prize">Prize</label>
                <input
                  id="prize"
                  value={prize}
                  onChange={(event) => setPrize(event.target.value)}
                  placeholder="Friday off / the cabin weekend / the jacket"
                />
              </div>
              <div className="field">
                <label htmlFor="who">Who can enter</label>
                <input id="who" value={whoCanEnter} onChange={(event) => setWhoCanEnter(event.target.value)} />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="count">Tickets</label>
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
                  <label htmlFor="when">We draw</label>
                  <input id="when" value={drawNote} onChange={(event) => setDrawNote(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="hostName">Ask</label>
                <input
                  id="hostName"
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Priya"
                  autoComplete="name"
                />
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={onePerPerson}
                  onChange={(event) => setOnePerPerson(event.target.checked)}
                />
                One per person
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={mustBePresent}
                  onChange={(event) => setMustBePresent(event.target.checked)}
                />
                Must be here to win
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null || connecting || overlayDown}
                onClick={() => void runStart()}
              >
                {busy === 'start' ? 'Starting…' : 'Start'}
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
              <h2>{drawn ? 'Winner' : header.title}</h2>
              <button type="button" className="btn" disabled={listBusy} onClick={() => void refresh()}>
                {listBusy ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="facts">
              {whoLine}
              <br />
              We draw {whenLine}
              <br />
              <span className="count">{taken} of {header.ticketCount} taken</span>
              {header.onePerPerson ? (
                <>
                  <br />
                  One per person
                </>
              ) : (
                <>
                  <br />
                  You can pass this stub to a coworker
                </>
              )}
              <br />
              Ask {asked}
              <br />
              {header.mustBePresent !== false
                ? 'Free. Must be here when we draw.'
                : 'Free.'}
            </p>
            {drawn && winnerName(tickets, drawn) && (
              <p className="status ok">
                {winnerName(tickets, drawn)} won.
              </p>
            )}
            {myTickets.map((ticket) => (
              <div className="stub" key={`${ticket.txid}.${ticket.outputIndex}`}>
                <p className="stub-mark">Raffle</p>
                <p className="stub-name">{ticket.holderName || guestName || 'Your stub'}</p>
                <p className="stub-number count">{String(ticket.ticketIndex).padStart(2, '0')}</p>
              </div>
            ))}

            {showTake && (
              <div className="fields">
                <div className="field">
                  <label htmlFor="guestName">Your name</label>
                  <input
                    id="guestName"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="The name on the stub"
                    autoComplete="name"
                  />
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== null || connecting || overlayDown}
                    onClick={() => void runClaim()}
                  >
                    {busy === 'claim' ? 'Taking…' : 'Take a ticket'}
                  </button>
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
              </div>
            )}

            {!showTake && isHost && !drawn && (
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || connecting || overlayDown || live.length === 0}
                  onClick={() => void runDraw()}
                >
                  {busy === 'draw' ? 'Drawing…' : 'Draw'}
                </button>
              </div>
            )}

            {canPass && !drawn && (
              <div className="fields pass">
                <h2>Pass your stub</h2>
                <p className="job">Hand your stub to the person who had to leave early.</p>
                <div className="field">
                  <label htmlFor="passName">Their name</label>
                  <input
                    id="passName"
                    value={passName}
                    onChange={(event) => setPassName(event.target.value)}
                    placeholder="Name on their stub"
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pass">Their account</label>
                  <input
                    id="pass"
                    value={passTo}
                    onChange={(event) => setPassTo(event.target.value)}
                    placeholder="Paste to hand the stub over"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || connecting || overlayDown || !passTo.trim() || !passName.trim() || (!heldHere && myTickets.length === 0)}
                    onClick={() => void runPass()}
                  >
                    {busy === 'pass' ? 'Handing…' : 'Pass'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void navigator.clipboard.writeText(shareUrl(header.raffleId))}
                  >
                    Copy link
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
                  {busy === 'receive' ? 'Receiving…' : `Receive stub ${incoming[0].ticketIndex}`}
                </button>
              </div>
            )}

            {!canPass && (
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(shareUrl(header.raffleId))}
                >
                  Copy link
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
      </details>

      <p className="fine-print">
        You must be present at the stage during the drawing to claim your prize.
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
