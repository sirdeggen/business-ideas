export const EYEBROW = 'Names'
export const DEFAULT_TITLE = 'Lease a name.'
export const LEDE = 'A name for a while. Look it up. Renew before it ends.'
export const LOOKUP_BUTTON = 'Look up'
export const REGISTER_BUTTON = 'Register'
export const RENEW_BUTTON = 'Renew'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a name.'
export const COPY_LINK = 'Copy link'
export const HOLDER_ONLY = 'Only the holder can renew'
export const AMOUNT_IN_ADVANCED = 'Amount in Advanced'
export const FOOTER = 'Not a contacts list. Not invoices.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'People and orgs need a human-readable name that resolves to something real for a while — look it up, use it, renew before it ends. A lease, not a forever land grab or a flip auction.'

export const BUSINESS_CASE_WHO =
  'Builders, clubs, and enterprise namespaces that already buy renewable names (grassroots: project and community ops; enterprise: IT / brand / internal naming). Registrants pay the lease; the desk takes a fee on register/renew.'

export const BUSINESS_CASE_MARKET =
  'ENS (DefiLlama, fetched Sep 2026): ~$325K fees in the last 30d; ~$4.0M trailing-year / annualized — registration + renewal only. Verisign (Q2 2026 earnings): $435M quarterly revenue; 179.1M combined .com/.net names in the base as of 30 Jun 2026 — people already pay for renewable names off-chain at scale.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: ENS — renewable .eth leases with a live fee stream on DefiLlama.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Domain registrars / Verisign .com/.net subscriptions — orgs and people renew names every year.'

export const BUSINESS_CASE_DEMO =
  'Pay a fixed-term lease → a stranger resolves the name to the right target on one URL → renew-before-expiry is visible (or expired fails) on that same visit. Fee and renew/fail proof explicit.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/ens',
    label: 'DefiLlama Sep 2026'
  },
  {
    href: 'https://investor.verisign.com/news-releases/news-release-details/verisign-reports-second-quarter-2026-results',
    label: 'Verisign Q2 2026'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export function sheetTitle(name?: string | null): string {
  const trimmed = name?.trim() ?? ''
  return trimmed || DEFAULT_TITLE
}

export function notFoundLine(name: string): string {
  return `${name} is free.`
}

export function leasedLine(name: string): string {
  return `${name} is leased.`
}

export function registeredStatus(name: string): string {
  return `Leased ${name}.`
}

export function renewedStatus(name: string): string {
  return `Renewed ${name}.`
}

export const PRIMARY_COPY = [
  EYEBROW,
  DEFAULT_TITLE,
  LEDE,
  LOOKUP_BUTTON,
  REGISTER_BUTTON,
  RENEW_BUTTON,
  EMPTY,
  COPY_LINK,
  HOLDER_ONLY,
  AMOUNT_IN_ADVANCED,
  FOOTER
] as const
