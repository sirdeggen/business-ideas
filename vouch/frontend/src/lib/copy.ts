export const TITLE = 'Vouch Desk'
export const EYEBROW = 'Vouch'
export const LEDE = 'Stake a slashable vouch. Attest. Slash on bad faith.'
export const LIST_HEADING = 'Vouches'
export const EMPTY_LIST = 'No vouches yet.'
export const LOOKUP_BUTTON = 'Look up'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a vouch.'
export const COPY_LINK = 'Copy link'
export const VOUCH_BUTTON = 'Vouch'
export const ATTEST_BUTTON = 'Attest'
export const SLASH_BUTTON = 'Slash'
export const RELEASE_BUTTON = 'Release'
export const VOUCH_HEADING = 'Stake a vouch'
export const VOUCH_JOB = 'A label, the supplier, and a bond.'
export const ATTEST_HEADING = 'Attest'
export const ATTEST_JOB = 'What was checked. Then pay to post.'
export const AMOUNT_IN_ADVANCED = 'Amount in Advanced'
export const FOOTER = 'Not a name lease. Not a title. Not a membership. Not a provenance receipt. Not a trading market.'
export const SUBJECT_LABEL = 'Supplier'
export const BOND_LABEL = 'Bond'
export const NOTE_LABEL = 'What was checked'
export const REASON_LABEL = 'Reason'
export const PAID_LABEL = 'Paid'
export const NOT_SLASHER = 'You cannot slash this vouch.'
export const NOT_VOUCHER = 'You cannot release this vouch.'
export const BOND_NOT_LIVE = 'That bond is no longer live.'
export const SLASHED = 'Slashed.'
export const RELEASED = 'Released.'
export const VOUCHED = 'Vouched.'
export const ATTESTED = 'Posted.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Informal vendor trust breaks when someone vouches with words only. A slashable vouch puts skin in the game: stake, attest, and slash on bad faith — credibility with a bond, not a tradable reputation token.'

export const BUSINESS_CASE_WHO =
  'Buyers and peers who already vouch for vendors (enterprise: procurement / vendor risk; grassroots: co-ops and community orgs). Vouchers lock stake; bad faith can cost them.'

export const BUSINESS_CASE_MARKET =
  'Ethos Network (DefiLlama, fetched Sep 2026): ~$931K TVL in the Vouch contract on Base — ETH locked as trust relationships. Protocol fee / vouch revenue is unknown on DefiLlama’s fees board. This desk is slashable vouch/attestation only — not a reputation-trading market.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Ethos-style slashable vouch — participants lock value behind another party and can propose slash on bad faith.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Surety bonds, trade credit insurance, vendor scorecards, escrow holdbacks — people already pay for “someone stands behind this supplier.”'

export const BUSINESS_CASE_DEMO =
  'Stake a vouch, attest, and show what slash looks like on a public desk URL.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/ethos-network',
    label: 'DefiLlama Sep 2026'
  },
  {
    href: 'https://docs.ethos.network/',
    label: 'Ethos docs'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export function sheetTitle(subject?: string | null): string {
  const trimmed = subject?.trim() ?? ''
  return trimmed || TITLE
}

export function notFoundLine(query: string): string {
  return `No vouch for ${query}.`
}

export function vouchedStatus(subject: string): string {
  return `Vouched ${subject}.`
}

export function attestedStatus(note: string): string {
  return `Posted ${note}.`
}

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  LIST_HEADING,
  EMPTY_LIST,
  LOOKUP_BUTTON,
  EMPTY,
  COPY_LINK,
  VOUCH_BUTTON,
  ATTEST_BUTTON,
  SLASH_BUTTON,
  RELEASE_BUTTON,
  VOUCH_HEADING,
  VOUCH_JOB,
  ATTEST_HEADING,
  ATTEST_JOB,
  AMOUNT_IN_ADVANCED,
  FOOTER,
  SUBJECT_LABEL,
  BOND_LABEL,
  NOTE_LABEL,
  REASON_LABEL,
  PAID_LABEL
] as const
