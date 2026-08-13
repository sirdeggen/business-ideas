import type { ReactNode } from 'react'
import { ADVANCE_PERCENT, advanceSats, type ReceivablePayload } from '../../../protocol/receivable'
import { samplePartyName } from '../../../protocol/samples'
import { formatSats, shortKey } from '../lib/config'
import type { OverlayReceivable } from '../lib/overlay'

export function partyLabel(identityKey: string): string {
  const name = samplePartyName(identityKey)
  if (name) return `${name} (${shortKey(identityKey, 6)})`
  return shortKey(identityKey, 8)
}

export function InvoiceCard({
  item,
  outpoint,
  children
}: {
  item: ReceivablePayload
  outpoint?: string
  children?: ReactNode
}) {
  const overlay = item as OverlayReceivable
  const point = outpoint ?? (overlay.txid ? `${overlay.txid}.${overlay.outputIndex}` : '')
  return (
    <article className={`invoice status-${item.status}`}>
      <div className="invoice-head">
        <h3>{item.invoiceId}</h3>
        <span className={`pill ${item.status}`}>{item.status}</span>
      </div>
      <dl className="meta">
        <div>
          <dt>Creditor</dt>
          <dd>{partyLabel(item.creditor)}</dd>
        </div>
        <div>
          <dt>Debtor</dt>
          <dd>{partyLabel(item.debtor)}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{formatSats(item.amountSats)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{item.dueDate}</dd>
        </div>
      </dl>
      {item.memo && <p className="memo">{item.memo}</p>}
      {item.advanceBps > 0 && (
        <p className="intent">
          Advance-intent {ADVANCE_PERCENT}% = {formatSats(advanceSats(item.amountSats, item.advanceBps))}
          {' '}(recorded, no credit moved)
        </p>
      )}
      {point && <p className="outpoint">UTXO {shortKey(point, 12)}</p>}
      {children}
    </article>
  )
}
