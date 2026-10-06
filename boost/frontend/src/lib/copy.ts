import {
  BOOST_PACKS,
  PROFILE_FEE_SATS,
  formatSats,
  type BoostPack,
  type Category
} from '../../../protocol/boost'

export const JOB = 'Pay for a verified listing. Buy a timed boost. Ranking is on-chain.'
export const EYEBROW = 'Boost'
export const PRODUCT = 'Boost Desk'
export const BUY_BUTTON = 'Buy profile'
export const BUYING_BUTTON = 'Buying profile…'
export const BOOST_12_BUTTON = 'Buy 12-hour boost'
export const BOOST_24_BUTTON = 'Buy 24-hour boost'
export const BOOSTING_BUTTON = 'Buying boost…'
export const EXPORT_BUTTON = 'Export reading'
export const BUY_JOB = 'Name the listing. The profile fee is on the quote. A boost comes after the profile is on the directory.'
export const BOOST_JOB = 'Buy a 12-hour or 24-hour boost. The listing ranks above the others while that window is open.'
export const STRANGER_LINE = 'Anyone with this link can read the listing and the boost receipts. No wallet to look.'
export const PROFILE_FEE_LABEL = 'Profile fee'
export const BOOST_PACK_LABEL = 'Boost pack'
export const FEE_FACE = 'Profile fee and boost packs are the desk’s revenue. Each one is its own labeled output.'
export const HONESTY_LINE = 'The profile fee and the boost pack are paid in sats. Verified means the owner signed the listing and the fee is named on the receipt. It is not a background check. Ranking is read from boost receipts whose windows are still open. v0 does not hold anything beyond those fees. Reading a receipt does not by itself prove the fee output was paid.'
export const DISTINCT_LINE = 'A paid listing and a timed boost. Not a name lease, a trust bond, or a signed data feed.'
export const RANK_RULE = 'A listing with an open boost ranks above one without. When the window ends, it falls back. Anyone can read the boost receipts.'
export const RANK_CLOCK = 'Ranking uses the window on the receipt and the clock on this device.'
export const AUDIT_LINE = 'These receipts are the ranking. Nothing else promotes a listing.'
export const DESK_DEFAULT = 'Leave the desk key blank and the profile fee and boost packs are paid to this wallet.'
export const EMPTY_LIST = 'No listings yet.'
export const BOOSTED_WORD = 'Boosted'
export const LISTED_WORD = 'Listed'
export const NOT_OWNER = 'This wallet didn’t buy the listing.'
export const DUPLICATE_PROFILE = 'This wallet already has a listing under that name.'
export const DUPLICATE_NOTE = 'An earlier listing under this name is the one in the directory. This receipt is still here to read.'
export const SCENE_ALT = 'A woman in a magenta jacket stands beside a night-market directory board, with one listing raised above the others inside a 12-hour countdown ring.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Local businesses, events, and vendors pay to be found, and a directory that hides paid placement can’t be checked. This desk sells a verified listing and a timed boost, with every boost written as a public receipt so the ranking can be audited.'

export const BUSINESS_CASE_WHO =
  'The business, the event host, or the vendor who pays once for a verified profile, and that same owner when they buy a 12-hour or 24-hour boost.'

export const BUSINESS_CASE_MARKET =
  'DEX Screener retained about $5.39M over 30 days from listing fees (DefiLlama, 2026-10-06). Public prices: Enhanced Token Info $299 one-time (list $499), boost packs of 12–24 hours, banners from $299, and a trending-bar slot from $2,000. The analog is DEX Screener paid profiles and boosts, not the whole Screener business.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: DEX Screener token-profile listing fees and timed boosts, about $5.39M over 30 days per DefiLlama.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: local directories and event guides that charge for a listing and for featured placement.'

export const BUSINESS_CASE_DEMO =
  'In one visit, pay for a verified profile, share the link, and buy a timed boost so that listing ranks above the others while the window is open, then falls back when it ends.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/dexscreener',
    label: 'DefiLlama DEX Screener'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

const CATEGORY_FACE: Record<Category, string> = {
  business: 'Business',
  event: 'Event',
  vendor: 'Vendor'
}

export function categoryFace(category: Category): string {
  return CATEGORY_FACE[category]
}

export function profileFeeFace(): string {
  return formatSats(PROFILE_FEE_SATS)
}

export function packFace(pack: BoostPack): string {
  const row = BOOST_PACKS[pack]
  const span = pack === '12h' ? '12 hours' : '24 hours'
  return `${span} · ${formatSats(row.sats)}`
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

export function formatRemaining(endsAt: string, nowMs: number): string {
  const ms = Date.parse(endsAt) - nowMs
  if (!Number.isFinite(ms) || ms <= 0) return 'ended'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours >= 1) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}
