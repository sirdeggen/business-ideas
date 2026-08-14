import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { qrPayload } from '../../../protocol/ticket'
import { useBasket } from '../context/BasketContext'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import {
  isIdentityKey,
  transferTicket,
  type HeldTicket
} from '../lib/actions'
import { errorMessage } from '../lib/config'

export function Attendee() {
  const { wallet, identityKey } = useWallet()
  const { url } = useOverlay()
  const { tickets, error: basketError, refresh: refreshBasket } = useBasket()
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [advancedTo, setAdvancedTo] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {}
      for (const ticket of tickets) {
        next[ticket.outpoint] = await QRCode.toDataURL(qrPayload(ticket.outpoint, ticket.ticket), {
          margin: 1,
          width: 240
        })
      }
      setQrs(next)
    })().catch((err: unknown) => {
      console.error('QR render failed', err)
      setError(errorMessage(err))
    })
  }, [tickets])

  const sendAdvanced = async (held: HeldTicket): Promise<void> => {
    if (!wallet) return
    setError(null)
    setStatus(null)
    try {
      await transferTicket(
        wallet,
        url,
        held,
        (advancedTo[held.outpoint] ?? '').trim()
      )
      setStatus(`Sent ticket ${held.ticket.serial}.`)
      await refreshBasket()
    } catch (err) {
      console.error('Transfer failed', err)
      setError(errorMessage(err))
    }
  }

  const listError = error || basketError

  if (tickets.length === 0) {
    return (
      <section className="panel">
        <h2>Your tickets</h2>
        <p className="hint">No ticket yet — get one from the organizer.</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>Your tickets</h2>
      <p>Show the QR at the door.</p>
      {tickets.map((held) => {
        const hex = advancedTo[held.outpoint] ?? ''
        return (
          <article className="ticket" key={held.outpoint}>
            <div className="ticket-body">
              <div className="serial">GA · {held.ticket.serial.padStart(3, '0')}</div>
              <h3>{held.ticket.name}</h3>
              <div className="ticket-meta">
                <div>Venue<strong>{held.ticket.venue}</strong></div>
              </div>
              <h3 className="subhead">Send to a friend</h3>
              <label htmlFor={`email-${held.outpoint}`}>Email</label>
              <input
                id={`email-${held.outpoint}`}
                type="email"
                placeholder="friend@example.com"
                autoComplete="email"
              />
              <label htmlFor={`phone-${held.outpoint}`}>Phone</label>
              <input
                id={`phone-${held.outpoint}`}
                type="tel"
                placeholder="Phone number"
                autoComplete="tel"
              />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn" disabled title="not available yet">
                  Send to a friend
                </button>
              </div>
              <p className="hint">not available yet</p>
              <details className="advanced">
                <summary>Advanced</summary>
                <label htmlFor={`hex-${held.outpoint}`}>Identity key</label>
                <div className="row">
                  <input
                    id={`hex-${held.outpoint}`}
                    value={hex}
                    onChange={(event) => setAdvancedTo((current) => ({
                      ...current,
                      [held.outpoint]: event.target.value
                    }))}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    className="btn"
                    disabled={!isIdentityKey(hex) || hex === identityKey}
                    onClick={() => void sendAdvanced(held)}
                  >
                    Send
                  </button>
                </div>
              </details>
            </div>
            <div className="stub">
              {qrs[held.outpoint] && <img alt={`QR for ticket ${held.ticket.serial}`} src={qrs[held.outpoint]} />}
              <span className="serial">{held.ticket.serial.padStart(3, '0')}</span>
            </div>
          </article>
        )
      })}
      {status && <p className="status ok">{status}</p>}
      {listError && <p className="status err">{listError}</p>}
    </section>
  )
}
