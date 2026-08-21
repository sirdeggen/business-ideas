import { useState } from 'react'
import { DEMO_EVENT, parseQrPayload } from '../../../protocol/ticket'
import { useOverlay } from '../context/OverlayContext'
import { useWallet } from '../context/WalletContext'
import { listHeldTickets, redeemTicket } from '../lib/actions'
import { errorMessage, overlayCheckFailed, shortKey } from '../lib/config'
import { formatUsedAt } from '../lib/copy'
import { lookupTickets } from '../lib/overlay'

type DoorLook = 'admit' | 'reject' | 'used'

export function Door() {
  const { wallet } = useWallet()
  const { url, online, probeError } = useOverlay()
  const [scan, setScan] = useState('')
  const [busy, setBusy] = useState(false)
  const [look, setLook] = useState<DoorLook | null>(null)
  const [detail, setDetail] = useState<string>('')
  const [usedAt, setUsedAt] = useState<string | null>(null)
  const [canRedeem, setCanRedeem] = useState(false)
  const [outpoint, setOutpoint] = useState<string | null>(null)
  const [spendNote, setSpendNote] = useState<string | null>(null)

  const overlayDown = online === false
  const checkDisabled = busy || !scan.trim() || overlayDown
  const checkTitle = overlayDown
    ? overlayCheckFailed(probeError, url)
    : !scan.trim()
      ? 'Paste or scan the ticket first'
      : 'Check this ticket'

  const check = async (): Promise<void> => {
    setBusy(true)
    setLook(null)
    setCanRedeem(false)
    setOutpoint(null)
    setUsedAt(null)
    setSpendNote(null)
    try {
      if (overlayDown) throw new Error(overlayCheckFailed(probeError, url))
      const parsed = parseQrPayload(scan)
      if (!parsed) {
        setLook('reject')
        setDetail('Not a ticket.')
        return
      }
      const live = await lookupTickets(url, { outpoint: parsed.outpoint })
      if (live.length === 0) {
        setLook('used')
        setDetail('Already used.')
        setOutpoint(parsed.outpoint)
        return
      }
      const ticket = live[0]
      if (ticket.eventId !== DEMO_EVENT.eventId) {
        setLook('reject')
        setDetail('Not a ticket.')
        setOutpoint(parsed.outpoint)
        return
      }
      setLook('admit')
      setOutpoint(parsed.outpoint)
      setDetail(`GA ${ticket.serial} · ${ticket.name} · ${ticket.venue}`)
      if (wallet) {
        const held = await listHeldTickets(wallet)
        setCanRedeem(held.some((item) => item.outpoint === parsed.outpoint))
      }
    } catch (err) {
      console.error('Door lookup failed', err)
      setLook('reject')
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
      if (!held) throw new Error('This wallet does not hold that ticket.')
      const result = await redeemTicket(wallet, url, held)
      const stillLive = await lookupTickets(url, { outpoint })
      setLook('used')
      setCanRedeem(false)
      setUsedAt(formatUsedAt())
      setSpendNote(result.txid)
      setDetail(stillLive.length === 0
        ? 'Used.'
        : 'Used — the door list still shows it. Check the overlay.')
    } catch (err) {
      console.error('Redeem failed', err)
      setLook('reject')
      setDetail(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>At the door</h2>
      <p>
        Paste or scan the ticket. Check it, then spend it so it can’t be used
        twice.
      </p>
      <label htmlFor="scan">Ticket</label>
      <textarea id="scan" rows={4} value={scan} onChange={(event) => setScan(event.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn primary"
          disabled={checkDisabled}
          title={checkTitle}
          onClick={() => void check()}
        >
          {busy ? 'Checking…' : 'Check ticket'}
        </button>
        {canRedeem && (
          <button className="btn danger" disabled={busy} onClick={() => void redeem()}>
            Redeem (spend)
          </button>
        )}
      </div>
      {overlayDown && <p className="status err">{overlayCheckFailed(probeError, url)}</p>}
      {checkDisabled && !overlayDown && !scan.trim() && (
        <p className="hint">Paste or scan the ticket.</p>
      )}
      {look !== null && (
        <div className={`door-result ${look === 'admit' ? 'valid' : look === 'used' ? 'used' : 'invalid'}`}>
          {look === 'admit' && <strong>Admit</strong>}
          {look === 'reject' && <strong>Reject</strong>}
          {look === 'used' && <strong className="used-stamp">Used</strong>}
          <div>{detail}</div>
          {look === 'used' && usedAt && <div>{usedAt}</div>}
        </div>
      )}
      {(outpoint || spendNote) && (
        <details className="advanced">
          <summary>Advanced</summary>
          {outpoint && <p>Outpoint {shortKey(outpoint, 10)}</p>}
          {spendNote && <p>Spend {shortKey(spendNote, 10)}</p>}
        </details>
      )}
    </section>
  )
}
