import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { qrPayload } from '../../../protocol/ticket'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import {
  acceptTransfer,
  isIdentityKey,
  listHeldTickets,
  parseTransferPackage,
  transferTicket,
  type HeldTicket,
  type TransferPackage
} from '../lib/actions'
import { errorMessage, shortKey } from '../lib/config'

export function Attendee() {
  const { wallet, identityKey } = useWallet()
  const { url } = useOverlay()
  const [tickets, setTickets] = useState<HeldTicket[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [recipients, setRecipients] = useState<Record<string, string>>({})
  const [incoming, setIncoming] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [packageJson, setPackageJson] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    if (!wallet) return
    const held = await listHeldTickets(wallet)
    setTickets(held)
    const next: Record<string, string> = {}
    for (const ticket of held) {
      next[ticket.outpoint] = await QRCode.toDataURL(qrPayload(ticket.outpoint, ticket.ticket), {
        margin: 1,
        width: 240
      })
    }
    setQrs(next)
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [wallet])

  const send = async (held: HeldTicket): Promise<void> => {
    if (!wallet) return
    setError(null)
    setStatus(null)
    try {
      const pack: TransferPackage = await transferTicket(
        wallet,
        url,
        held,
        (recipients[held.outpoint] ?? '').trim()
      )
      setPackageJson(JSON.stringify(pack))
      setStatus(`Transferred ticket ${held.ticket.serial}. Give the package below to the recipient.`)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const accept = async (): Promise<void> => {
    if (!wallet) return
    setError(null)
    try {
      await acceptTransfer(wallet, parseTransferPackage(incoming))
      setStatus('Ticket internalized into your eventtickets basket.')
      setIncoming('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Your tickets</h2>
        <p>
          Show the QR at the door. Transfer is a BSV spend to another identity key
          (66-hex compressed pubkey), not a listing.
        </p>
        <div className="row">
          <button className="btn" onClick={() => void refresh()}>Refresh basket</button>
        </div>
        {tickets.length === 0 && <p className="hint">No tickets in the eventtickets basket yet.</p>}
        {tickets.map((held) => {
          const recipient = recipients[held.outpoint] ?? ''
          return (
            <article className="ticket" key={held.outpoint}>
              <div className="ticket-body">
                <div className="serial">GA · {held.ticket.serial.padStart(3, '0')}</div>
                <h3>{held.ticket.name}</h3>
                <div className="ticket-meta">
                  <div>Venue<strong>{held.ticket.venue}</strong></div>
                  <div>Outpoint<strong>{shortKey(held.outpoint, 8)}</strong></div>
                </div>
                <label htmlFor={`to-${held.outpoint}`}>Transfer to identity key</label>
                <div className="row">
                  <input
                    id={`to-${held.outpoint}`}
                    placeholder="02… or 03… compressed pubkey"
                    value={recipient}
                    onChange={(event) => setRecipients((current) => ({
                      ...current,
                      [held.outpoint]: event.target.value
                    }))}
                  />
                  <button
                    className="btn"
                    disabled={!isIdentityKey(recipient) || recipient === identityKey}
                    onClick={() => void send(held)}
                  >
                    Transfer
                  </button>
                </div>
              </div>
              <div className="stub">
                {qrs[held.outpoint] && <img alt={`QR for ticket ${held.ticket.serial}`} src={qrs[held.outpoint]} />}
                <span className="serial">{held.ticket.serial.padStart(3, '0')}</span>
              </div>
            </article>
          )
        })}
      </section>

      <section className="panel">
        <h2>Accept a transfer</h2>
        <p>Paste the JSON package from the sender. This calls internalizeAction into your basket.</p>
        <textarea rows={6} value={incoming} onChange={(event) => setIncoming(event.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!incoming.trim()} onClick={() => void accept()}>
            Internalize ticket
          </button>
        </div>
      </section>

      {packageJson && (
        <section className="panel">
          <h2>Handoff package</h2>
          <p>The recipient pastes this into Accept a transfer. The UTXO is already theirs on-chain.</p>
          <textarea rows={8} readOnly value={packageJson} />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => void navigator.clipboard.writeText(packageJson)}
            >
              Copy package
            </button>
          </div>
        </section>
      )}

      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </>
  )
}
