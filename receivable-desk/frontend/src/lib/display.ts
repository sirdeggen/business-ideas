import { isIdentityKey } from '../../../protocol/receivable'
import { samplePartyName } from '../../../protocol/samples'

/**
 * Treasurer-facing party label. Display names win. Identity keys are not
 * work-row titles — those stay under Advanced.
 */
export function partyName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!isIdentityKey(trimmed)) return trimmed
  return samplePartyName(trimmed) ?? ''
}

export function workRowTitle(debtor: string, invoiceId: string): string {
  return partyName(debtor) || invoiceId
}
