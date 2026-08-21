import { useEffect, useState } from 'react'
import { clerkReceiptId, formatWhen } from './lib/copy'
import { displayNameFor } from './lib/identity'
import { displayUsd } from './lib/money'
import { lookupPublicReceipt, type OverlayLookupStatus } from './lib/overlay'
import { shortKey, verifyPublishedReceipt, verifyReceiptPurpose } from './lib/protocol'
import type { CachedPublicReceipt } from './lib/persist'

export function ReceiptView({
  txid,
  deskName = ''
}: {
  txid: string
  deskName?: string
}) {
  const [status, setStatus] = useState<OverlayLookupStatus>('checking')
  const [found, setFound] = useState<CachedPublicReceipt | null>(null)
  const [usedCache, setUsedCache] = useState(false)
  const [error, setError] = useState('')
  const [lookedUpName, setLookedUpName] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('checking')
    void lookupPublicReceipt(txid).then((result) => {
      if (cancelled) return
      setFound(result.found)
      setStatus(result.status)
      setUsedCache(result.usedCache)
      setError(result.error || '')
    })
    return () => { cancelled = true }
  }, [txid])

  useEffect(() => {
    if (deskName.trim() || !found?.receipt.orgIdentityKey) return
    let cancelled = false
    void displayNameFor(found.receipt.orgIdentityKey).then((name) => {
      if (!cancelled && name) setLookedUpName(name)
    })
    return () => { cancelled = true }
  }, [deskName, found])

  const purposeOk = found ? verifyReceiptPurpose(found.receipt) : false
  const signatureOk = found
    ? verifyPublishedReceipt(found.receipt, found.signature, found.signingKey)
    : false
  const clerkName = deskName.trim() || lookedUpName

  return (
    <>
      {status === 'checking' && <p className="helper">Looking up this receipt…</p>}
      {status === 'failed' && !found && (
        <p className="status err">
          Could not reach the public list. The receipt is not missing because this
          page failed — try again in a moment.
        </p>
      )}
      {status !== 'checking' && !found && status !== 'failed' && (
        <p className="helper">No public receipt at this link.</p>
      )}
      {usedCache && found && (
        <p className="helper">Showing the last good copy of this receipt.</p>
      )}
      {error && found && <p className="helper">{error}</p>}
      {found && (
        <>
          <p className="amount-xl">{displayUsd(found.receipt.amountUsd)}</p>
          <p className="receipt-purpose">{found.receipt.purpose}</p>
          {found.receipt.at && <p className="receipt-meta">{formatWhen(found.receipt.at)}</p>}
          <p className="receipt-meta">{clerkReceiptId(found.receipt.giftTxid)}</p>
          {clerkName && <p className="receipt-meta">{clerkName}</p>}
          {signatureOk && purposeOk && (
            <p className="helper">This receipt is bound to the purpose printed above.</p>
          )}
          {!purposeOk && (
            <p className="helper">The printed purpose does not match the bound hash.</p>
          )}
          <p className="quiet">
            This is a receipt for a purpose-restricted gift. It is not a tax document.
          </p>
          <details className="advanced">
            <summary>Advanced</summary>
            <p>Purpose hash <code>{found.receipt.purposeHash}</code></p>
            <p>Desk <code>{shortKey(found.receipt.orgIdentityKey)}</code></p>
            <p>Donor <code>{shortKey(found.receipt.donorIdentityKey)}</code></p>
            <p>Gift <code>{shortKey(found.receipt.giftTxid)}</code></p>
          </details>
        </>
      )}
    </>
  )
}
