import { AUM_SUBSCRIPTION_SATS, TRANSFER_FEE_SATS, formatSats, formatUnits } from '../../../protocol/registry'

export const JOB = 'Issue units on a register. Transfer with a receipt. Export the reading.'
export const EYEBROW = 'Ledger'
export const PRODUCT = 'Registry Desk'
export const CREATE_BUTTON = 'Create register'
export const ISSUE_BUTTON = 'Issue units'
export const TRANSFER_BUTTON = 'Transfer'
export const EXPORT_BUTTON = 'Export reading'
export const CREATING_BUTTON = 'Creating…'
export const ISSUING_BUTTON = 'Issuing…'
export const TRANSFERRING_BUTTON = 'Transferring…'
export const CREATE_JOB = 'Name the register, the unit, and an optional total or AUM note.'
export const ISSUE_JOB = 'Issue units to a holder.'
export const TRANSFER_JOB = 'Move units. A receipt lands on the register.'
export const EXPORT_JOB = 'Download the current holdings.'
export const STRANGER_LINE = 'Anyone with this link can read the holdings and export a reading. No wallet to look.'
export const FEE_FACE = 'Each transfer pays a small protocol fee.'
export const AUM_LINE = 'Admin / AUM subscription is marked on this register. v0 does not collect it.'
export const FEE_LINE = 'The transfer protocol fee is a separately labeled output. The AUM subscription is a mark only.'
export const NOT_ADMIN = 'This wallet didn’t create the register.'
export const NOT_ENOUGH = 'That holder doesn’t have enough units.'
export const NEED_HOLDER = 'Write an identity key or a share link.'
export const EMPTY_BOOK = 'No units issued yet.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Co-ops, HOAs, clubs, and small funds need a share register and a transfer agent: issue units, record a paid transfer, and hand someone a current reading — without standing up a tokenized Treasury.'

export const BUSINESS_CASE_WHO =
  'Issuers (HOAs, clubs, small funds, co-ops) pay an admin / AUM subscription. Holders pay a fee on each transfer. Securitize’s transfer-agent and asset-services work is the analog: revenue tied to issuers and tokenized AUM. Grassroots secretaries keep the same kind of book.'

export const BUSINESS_CASE_MARKET =
  'X, 7d, non-RT, lang:en (2026-09-22): Securitize / BUIDL / transfer agent / share registry ~193 posts. DefiLlama 30d retained the same day: BlackRock BUIDL ~$501k, Spiko ~$519k, Centrifuge ~$462k, Grayscale RWA ~$17.5M. Those are RWA fee pools. Transfer-agent take sits inside issuer and AUM services; a separate public transfer-agent line was not published.'

export const BUSINESS_CASE_PROOF = [
  'Securitize: transfer-agent and asset-services fees tied to issuers and tokenized AUM. The public split of that transfer-agent revenue is unpublished.',
  'Non-chain analog: HOA ledgers, co-op share books, club cap tables, and fund-admin registers — orgs already pay to keep a book and attest a transfer.',
  'BlackRock BUIDL on DefiLlama (~$501k / 30d, fetched 2026-09-22) is neighboring tokenized-fund fee signal, not a share-register ARR figure.'
] as const

export const BUSINESS_CASE_DEMO =
  'Admin names an HOA unit ledger and issues units to a holder → holder or admin transfers units and pays the protocol fee → anyone with the register link exports the current reading with no wallet. One visit: create → issue → transfer → export.'

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function unitsLine(units: number, unitLabel: string): string {
  return `${formatUnits(units)} ${unitLabel}`
}

export function feeStory(): string {
  return `${FEE_LINE} Protocol fee ${formatSats(TRANSFER_FEE_SATS)}. Subscription mark ${formatSats(AUM_SUBSCRIPTION_SATS)} per month, not collected.`
}
