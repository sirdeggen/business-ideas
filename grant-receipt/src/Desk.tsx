import { useEffect, useState } from 'react'
import { useWallet } from './context/WalletContext'
import { DESKTOP_INSTALL_URL, errorMessage, giveHref } from './lib/config'
import { internalizeGift, signReceipt } from './lib/gift'
import { displayNameFor } from './lib/identity'
import { applyEvent, statusLabel, type GiftRecord } from './lib/machine'
import { pullDeskMessages, sendDeskMessage } from './lib/messagebox'
import { displayUsd } from './lib/money'
import { publishReceiptAnnouncement } from './lib/overlay'
import { readGifts, readOrgName, writeGifts, writeOrgName } from './lib/persist'
import {
  buildReceipt,
  isIdentityKey,
  shortKey,
  type AckNotice,
  type GiftNotice,
  type ReceiptNotice
} from './lib/protocol'

export function Desk() {
  const { wallet, identityKey, connecting, error, connect } = useWallet()
  const [orgName, setOrgName] = useState(() => readOrgName() || '')
  const [gifts, setGifts] = useState<GiftRecord[]>(() => readGifts('desk'))
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [fail, setFail] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    writeGifts('desk', gifts)
  }, [gifts])

  useEffect(() => {
    writeOrgName(orgName)
  }, [orgName])

  useEffect(() => {
    if (!wallet) return
    const tick = async (): Promise<void> => {
      const incoming = await pullDeskMessages(wallet)
      if (incoming.length === 0) return
      setGifts((current) => {
        let next = current
        for (const message of incoming) {
          try {
            next = applyEvent(next, message.kind === 'gift'
              ? { type: 'gift', gift: message }
              : message.kind === 'ack'
                ? { type: 'ack', ack: message }
                : { type: 'receipt', receipt: message })
          } catch {
            // Duplicate or out-of-order rows are ignored.
          }
        }
        return next
      })
    }
    void tick()
    const id = window.setInterval(() => { void tick() }, 8000)
    return () => window.clearInterval(id)
  }, [wallet])

  useEffect(() => {
    const unknown = gifts
      .map((gift) => gift.donorIdentityKey)
      .filter((key) => isIdentityKey(key) && !names[key] && !gifts.find((row) => row.donorIdentityKey === key && row.donorName))
    for (const key of [...new Set(unknown)].slice(0, 4)) {
      void displayNameFor(key).then((name) => {
        if (name) setNames((current) => ({ ...current, [key]: name }))
      })
    }
  }, [gifts, names])

  const donorLabel = (gift: GiftRecord): string => {
    return gift.donorName || names[gift.donorIdentityKey] || 'A donor'
  }

  const copyGiveLink = async (): Promise<void> => {
    setFail('')
    setNotice('')
    try {
      const session = identityKey ? { identityKey } : await connect()
      const href = giveHref(session.identityKey, orgName)
      await navigator.clipboard.writeText(href)
      setNotice('Give link copied. A donor opens it, states a purpose, and sends dollars.')
    } catch (err) {
      setFail(errorMessage(err))
    }
  }

  const onAck = async (gift: GiftRecord): Promise<void> => {
    setFail('')
    setNotice('')
    setBusy('Acknowledging…')
    try {
      const session = await connect()
      const noticeRow: GiftNotice = {
        v: 1,
        kind: 'gift',
        giftId: gift.giftId,
        purpose: gift.purpose,
        purposeHash: gift.purposeHash,
        amountUsd: gift.amountUsd,
        amountSats: gift.amountSats,
        donorIdentityKey: gift.donorIdentityKey,
        orgIdentityKey: gift.orgIdentityKey,
        giftTxid: gift.giftTxid,
        keyID: gift.keyID,
        beef: gift.beef,
        donorName: gift.donorName,
        orgName: gift.orgName,
        at: gift.at
      }
      await internalizeGift(session.wallet, noticeRow)
      const ack: AckNotice = {
        v: 1,
        kind: 'ack',
        giftId: gift.giftId,
        purposeHash: gift.purposeHash,
        orgIdentityKey: session.identityKey,
        donorIdentityKey: gift.donorIdentityKey,
        giftTxid: gift.giftTxid,
        at: new Date().toISOString()
      }
      await sendDeskMessage(session.wallet, gift.donorIdentityKey, ack)
      setGifts((current) => applyEvent(current, { type: 'ack', ack }))
      setNotice(`Acknowledged ${gift.purpose}. Next: issue the receipt.`)
    } catch (err) {
      setFail(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const onReceipt = async (gift: GiftRecord): Promise<void> => {
    setFail('')
    setNotice('')
    setBusy('Signing the receipt…')
    try {
      const session = await connect()
      const receipt = buildReceipt({
        purpose: gift.purpose,
        purposeHash: gift.purposeHash,
        amountUsd: gift.amountUsd,
        amountSats: gift.amountSats,
        donorIdentityKey: gift.donorIdentityKey,
        orgIdentityKey: session.identityKey,
        giftTxid: gift.giftTxid
      })
      const signed = await signReceipt(session.wallet, receipt)
      let announceTxid: string | undefined
      try {
        announceTxid = await publishReceiptAnnouncement(
          session.wallet,
          receipt,
          signed.signature,
          signed.signingKey
        )
      } catch {
        // Public list is optional. Message Box is enough for first success.
      }
      const message: ReceiptNotice = {
        v: 1,
        kind: 'receipt',
        giftId: gift.giftId,
        receipt,
        signature: signed.signature,
        signingKey: signed.signingKey,
        announceTxid,
        at: receipt.at
      }
      await sendDeskMessage(session.wallet, gift.donorIdentityKey, message)
      setGifts((current) => applyEvent(current, { type: 'receipt', receipt: message }))
      setNotice(announceTxid
        ? 'Signed receipt sent to the donor. A public copy is also up if someone has the link.'
        : 'Signed receipt sent to the donor.')
    } catch (err) {
      setFail(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <section className="panel">
        <h2>The desk</h2>
        <p>
          Incoming gifts arrive already tagged with a purpose. Acknowledge the
          purpose, then issue a receipt bound to it. This is not a vault and
          not a tax letter.
        </p>
        <label htmlFor="org-name">Desk name</label>
        <input
          id="org-name"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="St Mary’s, the community foundation…"
        />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => void copyGiveLink()}>
            Copy give link
          </button>
          <button className="btn" disabled={connecting} onClick={() => void connect().catch(() => undefined)}>
            {identityKey ? 'Wallet open' : 'Open wallet to see incoming gifts'}
          </button>
        </div>
        <p className="hint">
          Wallet is for acknowledge, receipt, and the give link. Incoming gifts
          do not show until the wallet is open.
        </p>
        <details className="advanced">
          <summary>Advanced</summary>
          {identityKey
            ? <p>Desk identity <code>{identityKey}</code></p>
            : <p>Open the wallet to see the desk identity.</p>}
          <p>
            <a href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">BSV Desktop</a>
          </p>
        </details>
      </section>

      {busy && <p className="status">{busy}</p>}
      {connecting && <p className="status">Waiting for wallet…</p>}
      {error && <p className="status err">{error}</p>}
      {notice && <p className="status ok">{notice}</p>}
      {fail && <p className="status err">{fail}</p>}

      <section className="panel">
        <h2>Incoming gifts</h2>
        {gifts.length === 0 ? (
          <p className="hint">
            Nothing in yet. Share the give link. When a donor sends a
            purpose-restricted gift, it lands here.
          </p>
        ) : (
          <ul className="gift-list">
            {gifts.slice().reverse().map((gift) => (
              <li key={gift.giftId}>
                <div className="gift-head">
                  <p className="amount">{displayUsd(gift.amountUsd, gift.amountSats, null)}</p>
                  <span className={`stamp ${gift.status === 'receipted' ? 'receipted' : ''}`}>
                    {statusLabel(gift.status)}
                  </span>
                </div>
                <p className="purpose">{gift.purpose}</p>
                <p className="hint">From {donorLabel(gift)}</p>
                <div className="row">
                  {gift.status === 'gifted' && (
                    <button className="btn primary" disabled={Boolean(busy)} onClick={() => void onAck(gift)}>
                      Acknowledge
                    </button>
                  )}
                  {gift.status === 'acknowledged' && (
                    <button className="btn primary" disabled={Boolean(busy)} onClick={() => void onReceipt(gift)}>
                      Issue receipt
                    </button>
                  )}
                </div>
                <details className="advanced">
                  <summary>Advanced</summary>
                  <p>Donor <code>{shortKey(gift.donorIdentityKey)}</code></p>
                  <p>Purpose hash <code>{gift.purposeHash}</code></p>
                  <p>Gift <code>{shortKey(gift.giftTxid)}</code></p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
