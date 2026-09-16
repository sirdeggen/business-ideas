import { typeFace, type AssetType, type HandoffStatus } from '../../../protocol/handoff'

export const TITLE = 'Handoff Desk'
export const EYEBROW = 'Studio'
export const LEDE = 'List a digital asset. Fund escrow. Confirm the handoff. Release.'
export const PRODUCT = 'Handoff Desk'
export const LIST_HEADING = 'Listings'
export const EMPTY_LIST = 'No listings yet.'
export const LIST_BUTTON = 'List an asset'
export const FUND_BUTTON = 'Fund escrow'
export const CONFIRM_BUTTON = 'Confirm'
export const RELEASE_BUTTON = 'Release'
export const LISTING_BUTTON = 'Listing…'
export const FUNDING_BUTTON = 'Funding…'
export const CONFIRMING_BUTTON = 'Confirming…'
export const RELEASING_BUTTON = 'Releasing…'
export const LIST_JOB = 'Title, type, and a price. Anyone can read the listing with no wallet.'
export const FUND_JOB = 'Fund the listing price into escrow.'
export const CONFIRM_JOB = 'Seller marks the handoff complete. Buyer marks it received.'
export const RELEASE_JOB = 'Both confirmed. Release pays the seller minus about 1%.'
export const STRANGER_LINE = 'Anyone with this link can read the listing. No wallet to look.'
export const FEE_STORY = 'About 1% protocol fee. Release pays the seller the listing price minus that fee.'
export const FOOTER = 'Not Vault Claim. Not Job Escrow. Digital ownership transfer only.'
export const SELLER_FALLBACK = 'Seller'
export const BUYER_FALLBACK = 'Buyer'
export const NOT_SELLER = 'This wallet didn’t list the asset.'
export const NOT_BUYER = 'This wallet didn’t fund the listing.'
export const NOT_PARTY = 'This wallet isn’t a party to this listing.'
export const NOT_HOLDING = 'This wallet doesn’t hold the funded escrow.'
export const STAMP_LISTED = 'Listed'
export const STAMP_FUNDED = 'Funded'
export const STAMP_SELLER = 'Seller confirmed'
export const STAMP_BUYER = 'Buyer confirmed'
export const STAMP_CONFIRMED = 'Confirmed'
export const STAMP_RELEASED = 'Released'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Two parties moving a digital asset need neither side to walk until both confirm — list, fund escrow, confirm, release. Clean handoff for domains, IP, or contract ownership — not a floor-price marketplace.'

export const BUSINESS_CASE_WHO =
  'Sellers and buyers of controllable digital assets — domains, IP rights, and contract ownership (enterprise: finance and IP ops; grassroots: small teams doing OTC handoffs). Parties split or assign an escrow fee on the deal.'

export const BUSINESS_CASE_MARKET =
  'L.A.U.R.A. Ownership Market / The Lab (Clutch Markets, Sep 2026 reporting): lists smart-contract ownership with escrow until payment, then transferOwnership — published take ~1%; completed sales volume at launch coverage was unknown / none yet reported. Escrow.com (public fee table): Standard fee 2.6% ($50 min) under $5K, stepping down to ~1.0% in the $1M–$3M band — people already pay mid-single-digit to ~1% for digital-asset and domain handoffs off-chain.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: L.A.U.R.A. Ownership Market — on-chain ownership escrow at ~1% for contract handoffs.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Escrow.com digital goods / domain escrow — funded → inspected → released with a published percentage fee.'

export const BUSINESS_CASE_DEMO =
  'Two parties complete a handoff on one URL with a clear funded → confirmed → released path.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://www.theboredapegazette.com/post/beep-boop-built-and-bought-clutch-markets-ai-swarm-laura-launches-an-all-new-smart-contract-mark',
    label: 'Clutch Markets, Sep 2026'
  },
  {
    href: 'https://www.escrow.com/fee-calculator',
    label: 'Escrow.com fees'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  LIST_HEADING,
  EMPTY_LIST,
  LIST_BUTTON,
  FUND_BUTTON,
  CONFIRM_BUTTON,
  RELEASE_BUTTON,
  LIST_JOB,
  FUND_JOB,
  CONFIRM_JOB,
  RELEASE_JOB,
  STRANGER_LINE,
  FEE_STORY,
  FOOTER
] as const

export function formatPrice(amount: number): string {
  return amount.toLocaleString('en-US')
}

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

export function stampFor(status: HandoffStatus): string {
  switch (status) {
    case 'funded':
      return STAMP_FUNDED
    case 'seller_confirmed':
      return STAMP_SELLER
    case 'buyer_confirmed':
      return STAMP_BUYER
    case 'confirmed':
      return STAMP_CONFIRMED
    case 'released':
      return STAMP_RELEASED
    default:
      return STAMP_LISTED
  }
}

export function typeLabel(type: AssetType): string {
  return typeFace(type)
}
