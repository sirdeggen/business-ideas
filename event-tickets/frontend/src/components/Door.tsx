import { useState } from 'react'
import { DEMO_EVENT, parseQrPayload } from '../../../protocol/ticket'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { listHeldTickets, redeemTicket } from '../lib/actions'
import { errorMessage, overlayCheckFailed, shortKey } from '../lib/config'
import { lookupTickets, overlayLookupService } from '../lib/overlay'

export function Door() {
  const { wallet } = useWallet()
  const { url, online, probeError } = useOverlay()
  const [scan, setScan] = useState('')
  const [busy, setBusy] = useState(false)
  const [valid, setValid] = useState<boolean | null>(null)
  const [detail, setDetail] = useState<string>('')
  const [canRedeem, setCanRedeem] = useState(false)
  const [outpoint, setOutpoint] = useState<string | null>(null)

  const overlayDown = online === false
  const lookupDisabled = busy || !scan.trim() || overlayDown
  const lookupTitle = overlayDown
    ? overlayCheckFailed(probeError, url)
    : !scan.trim()
      ? 'Paste a QR payload or outpoint first'
      : `Lookup this ticket on ${overlayLookupService(url)}`

  const check = async (): Promise<void> => {
    setBusy(true)
    setValid(null)
    setCanRedeem(false)
    setOutpoint(null)
    try {
      if (overlayDown) throw new Error(overlayCheckFailed(probeError, url))
      const parsed = parseQrPayload(scan)
      if (!parsed) throw new Error('QR must be ticket JSON or txid.vout')
      const live = await lookupTickets(url, { outpoint: parsed.outpoint })
      if (live.length === 0) {
        setValid(false)
        setDetail('Overlay has no live ticket at that outpoint. It was never admitted, or it was already spent.')
        return
      }
      const ticket = live[0]
      if (ticket.eventId !== DEMO_EVENT.eventId) {
        setValid(false)
        setDetail('This UTXO is not a Demo Night ticket.')
        return
      }
      setValid(true)
      setOutpoint(parsed.outpoint)
      setDetail(`GA ${ticket.serial} · ${ticket.name} · ${ticket.venue}`)
      if (wallet) {
        const held = await listHeldTickets(wallet)
        setCanRedeem(held.some((item) => item.outpoint === parsed.outpoint))
      }
    } catch (err) {
      console.error('Door lookup failed', err)
      setValid(false)
      setDetail(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const redeem = async (): Promise<void> => {
    if (!wallet || !outpoint) return
    setBusy(true)
    try {
      const held = (await listHeldTickets(wallet)).find((item) => item.outpoint === outpoint)
      if (!held) throw new Error('This wallet does not hold that ticket UTXO')
      const result = await redeemTicket(wallet, url, held)
      const stillLive = await lookupTickets(url, { outpoint })
      setValid(false)
      setCanRedeem(false)
      if (stillLive.length === 0) {
        setDetail(`Redeemed in ${result.txid}. Overlay lookup now rejects this spent UTXO.`)
      } else {
        setDetail(`Spent in ${result.txid}, but overlay still listed it. Check the overlay logs.`)
      }
    } catch (err) {
      console.error('Redeem failed', err)
      setDetail(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Door</h2>
      <p>
        Paste the attendee QR payload. Lookup queries {overlayLookupService(url)}
        and keeps Demo Night tickets only — spent tickets are gone. Redeem spends
        the UTXO from the wallet that holds it.
      </p>
      <label htmlFor="scan">QR payload or outpoint</label>
      <textarea id="scan" rows={4} value={scan} onChange={(event) => setScan(event.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn primary"
          disabled={lookupDisabled}
          title={lookupTitle}
          onClick={() => void check()}
        >
          {busy ? 'Checking…' : 'Lookup overlay'}
        </button>
        {canRedeem && (
          <button className="btn danger" disabled={busy} onClick={() => void redeem()}>
            Redeem (spend)
          </button>
        )}
      </div>
      {overlayDown && <p className="status err">{overlayCheckFailed(probeError, url)}</p>}
      {lookupDisabled && !overlayDown && !scan.trim() && (
        <p className="hint">Paste a QR payload or outpoint to enable lookup.</p>
      )}
      {valid !== null && (
        <div className={`door-result ${valid ? 'valid' : 'invalid'}`}>
          <strong>{valid ? 'Admit' : 'Reject'}</strong>
          <div>{detail}</div>
          {outpoint && <div>UTXO {shortKey(outpoint, 10)}</div>}
        </div>
      )}
    </section>
  )
}
