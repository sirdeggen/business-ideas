import { useEffect, useState } from 'react'
import { displayUsd } from './lib/money'
import { lookupPublicReceipt, type OverlayLookupStatus } from './lib/overlay'
import { shortKey, verifyPublishedReceipt, verifyReceiptPurpose } from './lib/protocol'
import type { CachedPublicReceipt } from './lib/persist'

export function ReceiptView({ txid }: { txid: string }) {
  const [status, setStatus] = useState<OverlayLookupStatus>('checking')
  const [found, setFound] = useState<CachedPublicReceipt | null>(null)
  const [usedCache, setUsedCache] = useState(false)
  const [error, setError] = useState('')

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

  const purposeOk = found ? verifyReceiptPurpose(found.receipt) : false
  const signatureOk = found
    ? verifyPublishedReceipt(found.receipt, found.signature, found.signingKey)
    : false

  return (
    <section className={`panel ${found ? 'receipt-card' : ''}`}>
      <h2>Receipt</h2>
      {status === 'checking' && <p className="hint">Looking up this receipt…</p>}
      {status === 'failed' && !found && (
        <p className="status err">
          Could not reach the public list. The receipt is not missing because this
          page failed — try again in a moment.
        </p>
      )}
      {status !== 'checking' && !found && status !== 'failed' && (
        <p className="hint">No public receipt at this link.</p>
      )}
      {usedCache && found && (
        <p className="hint">Showing the last good copy of this receipt.</p>
      )}
      {error && found && <p className="hint">{error}</p>}
      {found && (
        <>
          <div className="gift-head">
            <p className="amount">{displayUsd(found.receipt.amountUsd)}</p>
            <span className="stamp receipted">{signatureOk && purposeOk ? 'Bound' : 'Receipt'}</span>
          </div>
          <p className="purpose">{found.receipt.purpose}</p>
          <p>
            {purposeOk
              ? 'This receipt is bound to the purpose printed above.'
              : 'The printed purpose does not match the bound hash.'}
          </p>
          <p className="fine-print">
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
    </section>
  )
}
