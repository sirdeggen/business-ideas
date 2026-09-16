import type { FeedEvent, Proposal, Treasury } from '../../../protocol/events'
import { overlayBanner, type OverlayLookupStatus } from '../../../protocol/lookup'
import { ROLE_LABEL, thresholdMet, uniqueApprovers, type Role } from '../../../protocol/treasury'

const KIND_RANK: Record<string, number> = {
  created: 0,
  joined: 1,
  funded: 2,
  proposed: 3,
  approved: 4,
  declined: 5,
  paid: 6
}

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Groups that hold money together cannot trust one person’s account. A multi-approver vault turns “two people have to say yes” into readable minutes: propose → approve → pay — a board can audit who signed without learning a new dialect.'

export const BUSINESS_CASE_WHO =
  'Clubs, churches, HOAs, DAOs, and small companies that already run dual-control spending. The buyer is the group that needs joint custody, not the payee — enterprise treasury / AP dual control and grassroots volunteer treasurers alike.'

export const BUSINESS_CASE_MARKET =
  'Safe (formerly Gnosis Safe), Q2 2026: ~$27.24B self-custodied assets; 63.4M accounts; ~$39.3B Q2 transfer volume. Lifetime value processed cited >$1.4T. Share that is club/HOA dual-control vs DeFi/DAO is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Safe / Gnosis Safe — teams already coordinate serious capital through multi-approver smart accounts.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: BILL Dual Control and multi-approver AP workflows; banks’ dual-authorization wires — enterprises pay for “initiator ≠ approver” every day.'

export const BUSINESS_CASE_DEMO =
  '2-of-2 or 2-of-3 vault → propose → two approvals → pay; a stranger can read board minutes without joining the vault.'

export const BUSINESS_CASE_CITATIONS = [
  { href: 'https://safefoundation.org/blog/safe-q2-2026-quarterly-report', label: 'Safe Q2 2026' },
  { href: 'https://www.bill.com/product/accounts-payable-controls', label: 'BILL Dual Control' }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export function pageTitle(boardName?: string | null): string {
  const name = boardName?.trim()
  return name || 'Treasury'
}

/** Oldest first, like minutes. Same `at`: opened above joined. */
export function minutesAsDocument(feed: FeedEvent[]): FeedEvent[] {
  return [...feed].sort((a, b) => {
    const byTime = a.at.localeCompare(b.at)
    if (byTime !== 0) return byTime
    return (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99)
  })
}

/** No banner on the bare landing. Unknown/empty board is not “up to date.” */
export function boardBanner(input: {
  boardMode: boolean
  status: OverlayLookupStatus
  usedCache?: boolean
  hasMinutes: boolean
}): string | null {
  if (!input.boardMode) return null
  if (input.status === 'checking' || input.status === 'failed') {
    return overlayBanner(input.status, input.usedCache)
  }
  if (!input.hasMinutes) return null
  return overlayBanner(input.status, input.usedCache)
}

export function motionStatusWord(proposal: Proposal, treasury: Treasury): string {
  if (proposal.status === 'paid') return 'Paid'
  if (proposal.status === 'declined') return 'Declined'
  if (
    proposal.status === 'approved' ||
    thresholdMet(uniqueApprovers(proposal.approvals).length, treasury.threshold)
  ) {
    return 'Approved'
  }
  return 'Pending'
}

export function motionSentence(proposal: Proposal, treasury: Treasury): string {
  if (proposal.status === 'paid' || proposal.status === 'declined') return ''
  const yes = uniqueApprovers(proposal.approvals)
  if (
    proposal.status === 'approved' ||
    thresholdMet(yes.length, treasury.threshold)
  ) {
    return ''
  }
  if (yes.length === 0) return 'Waiting on two yeses.'
  const names = yes
    .map((row) => ROLE_LABEL[row.role as Role] ?? row.role)
    .join(', ')
  return `${names} said yes. Waiting on a second yes.`
}

export function spendSentence(proposal: Proposal, treasury: Treasury): string {
  if (proposal.status === 'paid' || proposal.status === 'declined') return ''
  const signed = uniqueApprovers(proposal.p2msSigs)
  if (signed.length >= treasury.threshold) return 'Ready to pay.'
  if (signed.length === 0) return ''
  const names = signed
    .map((row) => ROLE_LABEL[row.role as Role] ?? row.role)
    .join(', ')
  return `${names} signed the spend.`
}
