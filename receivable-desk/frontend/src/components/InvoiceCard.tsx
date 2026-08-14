import type { ReactNode } from 'react'
import { agingLabel, daysLate, isIdentityKey, type ReceivablePayload } from '../../../protocol/receivable'
import { samplePartyName } from '../../../protocol/samples'
import { formatSats, shortKey } from '../lib/config'

export function partyName(value: string): string {
  if (!isIdentityKey(value)) return value
  return samplePartyName(value) ?? shortKey(value, 8)
}

export function InvoiceCard({
  item,
  children
}: {
  item: ReceivablePayload
  outpoint?: string
  children?: ReactNode
}) {
  const unpaid = item.status !== 'paid'
  const aging = unpaid ? agingLabel(daysLate(item.dueDate)) : 'paid'
  return (
    <article className={`invoice status-${item.status}`}>
      <div className="invoice-head">
        <h3>{item.invoiceId}</h3>
        <span className={`pill ${unpaid ? 'open' : 'paid'}`}>{unpaid ? aging : 'paid'}</span>
      </div>
      <dl className="meta">
        <div>
          <dt>Owed to</dt>
          <dd>{partyName(item.creditor)}</dd>
        </div>
        <div>
          <dt>Who owes</dt>
          <dd>{partyName(item.debtor)}</dd>
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
      {children}
    </article>
  )
}
