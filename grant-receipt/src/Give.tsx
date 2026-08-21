import { useEffect, useRef, useState } from 'react'
import { useWallet } from './context/WalletContext'
import { DESKTOP_INSTALL_URL, errorMessage, newGiftId } from './lib/config'
import { clerkReceiptId, formatWhen } from './lib/copy'
import { sendGift, verifyReceiptWithWallet } from './lib/gift'
import { applyDonorUpdates, applyEvent, type GiftRecord } from './lib/machine'
import { sendDeskMessage, pullDeskMessages } from './lib/messagebox'
import { displayUsd, fetchUsdPerBsv, preferOnScreenAmount, readLiveAmountField, resolveGiftSpend, sendGiftLabel } from './lib/money'
import { lookupReceiptAnnouncements, publishGiftAnnouncement } from './lib/overlay'
import { readGifts, writeGifts } from './lib/persist'
import { DEFAULT_PURPOSE, isIdentityKey, purposeHash, shortKey, verifyPublishedReceipt } from './lib/protocol'

export function Give({
  orgIdentity,
  orgName
}: {
  orgIdentity: string
  orgName: string
}) {
  const { wallet, identityKey, connecting, error, connect } = useWallet()
  const amountRef = useRef<HTMLInputElement>(null)
  const [purpose, setPurpose] = useState(DEFAULT_PURPOSE)
  const [amountUsd, setAmountUsd] = useState('25.00')
  const [orgKey, setOrgKey] = useState(orgIdentity)
  const [who, setWho] = useState(orgName)
  const [donorName, setDonorName] = useState('')
  const [gifts, setGifts] = useState<GiftRecord[]>(() => readGifts('donor'))
  const [rate, setRate] = useState<number | null>(null)
  const [rateError, setRateError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [fail, setFail] = useState('')

  useEffect(() => {
    if (orgIdentity) setOrgKey(orgIdentity)
    if (orgName) setWho(orgName)
  }, [orgIdentity, orgName])

  useEffect(() => {
    writeGifts('donor', gifts)
  }, [gifts])

  useEffect(() => {
    let cancelled = false
    void fetchUsdPerBsv()
      .then((value) => {
        if (!cancelled) {
          setRate(value)
          setRateError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setRateError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      const looked = await lookupReceiptAnnouncements()
      const incoming = wallet ? await pullDeskMessages(wallet) : []
      if (cancelled) return
      if (looked.receipts.length === 0 && incoming.length === 0) return
      setGifts((current) => applyDonorUpdates(current, {
        messages: incoming,
        receipts: looked.receipts
      }))
    }
    void tick()
    const id = window.setInterval(() => { void tick() }, 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [wallet])

  const latest = gifts[gifts.length - 1]
  const onScreenAmount = preferOnScreenAmount(readLiveAmountField(amountRef.current), amountUsd)
  const giftLabel = sendGiftLabel(onScreenAmount, rate, amountUsd)

  const onSend = async (): Promise<void> => {
    setFail('')
    setNotice('')
    setBusy('Sending the gift…')
    try {
      let usdPerBsv = rate
      if (!usdPerBsv) {
        usdPerBsv = await fetchUsdPerBsv()
        setRate(usdPerBsv)
      }
      const liveField = readLiveAmountField(amountRef.current)
      const spend = resolveGiftSpend(liveField, usdPerBsv, amountUsd)
      if (spend.amountUsd !== amountUsd) setAmountUsd(spend.amountUsd)
      if (!isIdentityKey(orgKey)) {
        throw new Error('Open the give link from the treasurer, or paste their desk identity under Advanced.')
      }
      const session = await connect()
      const gift = await sendGift({
        wallet: session.wallet,
        donorIdentityKey: session.identityKey,
        orgIdentityKey: orgKey,
        purpose,
        amountUsd: spend.amountUsd,
        amountSats: spend.amountSats,
        giftId: newGiftId(),
        donorName: donorName.trim() || undefined,
        orgName: who.trim() || undefined
      })
      await sendDeskMessage(session.wallet, orgKey, gift)
      try {
        await publishGiftAnnouncement(session.wallet, gift)
      } catch {
        // Stranger desk list is optional. Message Box is first success.
      }
      setGifts((current) => applyEvent(current, { type: 'gift', gift }))
      setNotice('Gift sent. The desk will acknowledge, then send a receipt bound to this purpose.')
    } catch (err) {
      setFail(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const receiptCheck = latest?.receipt && latest.receiptSignature
    ? latest.signingKey
      ? verifyPublishedReceipt(latest.receipt, latest.receiptSignature, latest.signingKey)
      : purposeHash(latest.receipt.purpose) === latest.receipt.purposeHash
    : false

  useEffect(() => {
    if (!wallet || !latest?.receipt || !latest.receiptSignature || latest.signingKey) return
    void verifyReceiptWithWallet(wallet, latest.receipt, latest.receiptSignature).then((ok) => {
      if (ok) setNotice('Signed receipt verified. It is bound to the purpose you stated.')
    }).catch(() => undefined)
  }, [wallet, latest])

  return (
    <>
      <p className="job">
        State a purpose. Send a gift in dollars. The desk acknowledges, then
        you get a signed receipt bound to that purpose.
      </p>
      {who.trim() && <p className="desk-to">{who.trim()}</p>}
      <form
        className="fields"
        onSubmit={(event) => {
          event.preventDefault()
          void onSend()
        }}
      >
        <div className="field">
          <label htmlFor="purpose">This gift is for</label>
          <input
            id="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="roof repair"
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <div className="dollar">
            <span>$</span>
            <input
              id="amount"
              name="amount"
              ref={amountRef}
              value={amountUsd}
              onChange={(event) => setAmountUsd(event.target.value)}
              inputMode="decimal"
              placeholder="25.00"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="donor-name">Your name (optional)</label>
          <input
            id="donor-name"
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
            placeholder="Shown on the desk"
          />
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={Boolean(busy) || connecting}>
            {giftLabel}
          </button>
        </div>
      </form>
      {rateError && <p className="status err">{rateError}</p>}
      {busy && <p className="status">{busy}</p>}
      {connecting && <p className="status">Waiting for wallet…</p>}
      {error && <p className="status err">{error}</p>}
      {notice && <p className="status ok">{notice}</p>}
      {fail && <p className="status err">{fail}</p>}
      <p className="helper">
        A wallet is needed only to send. Declining the Desktop prompt does not send. The receipt comes back to this page.
      </p>

      {latest && (
        <section className="slip">
          <div className="mail-head">
            <p className="purpose">{latest.purpose}</p>
            <p className="amount">{displayUsd(latest.amountUsd, latest.amountSats, rate)}</p>
          </div>
          <p className={`status-word ${latest.status === 'receipted' ? 'receipted' : 'ack'}`}>
            {latest.status === 'gifted' ? 'Sent' : latest.status === 'acknowledged' ? 'Acknowledged' : 'Receipt issued'}
          </p>
          {latest.status === 'gifted' && (
            <p className="helper">Waiting for the desk to acknowledge this purpose.</p>
          )}
          {latest.status === 'acknowledged' && (
            <p className="helper">Acknowledged. Waiting for the signed receipt.</p>
          )}
          {latest.receipt && (
            <>
              {latest.receipt.at && <p className="when">{formatWhen(latest.receipt.at)}</p>}
              <p className="receipt-meta">{clerkReceiptId(latest.receipt.giftTxid)}</p>
              <p>
                Signed receipt for <strong>{latest.receipt.purpose}</strong>, bound to that
                purpose{receiptCheck ? '.' : ' — check the hash under Advanced if this looks off.'}
              </p>
              <p className="quiet">
                This is a receipt for a purpose-restricted gift. It is not a tax document.
              </p>
            </>
          )}
        </section>
      )}

      <details className="advanced">
        <summary>Advanced</summary>
        <p>
          <a href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">Need a wallet?</a>
        </p>
        <label htmlFor="org-key">Desk identity</label>
        <input
          id="org-key"
          value={orgKey}
          onChange={(event) => setOrgKey(event.target.value)}
          placeholder="66-hex identity from the treasurer"
          autoComplete="off"
        />
        <label htmlFor="desk-name">Desk name</label>
        <input
          id="desk-name"
          value={who}
          onChange={(event) => setWho(event.target.value)}
          placeholder="The church, the foundation, the hall"
        />
        {identityKey && (
          <p>Your identity <code>{shortKey(identityKey)}</code></p>
        )}
        <p>Purpose hash <code>{purpose.trim() ? purposeHash(purpose) : '—'}</code></p>
      </details>
    </>
  )
}
