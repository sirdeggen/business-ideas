export const EYEBROW = 'Trace'
export const DEFAULT_TITLE = 'Register a receipt.'
export const LEDE = 'Pay a little to register. Look it up.'
export const LOOKUP_BUTTON = 'Look up'
export const REGISTER_BUTTON = 'Register'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a receipt.'
export const COPY_LINK = 'Copy link'
export const AMOUNT_IN_ADVANCED = 'Amount in Advanced'
export const FOOTER = 'Not a dataset stall. Not a signed record desk.'
export const WHAT_LABEL = 'What'
export const WHO_LABEL = 'Who'
export const RIGHTS_LABEL = 'Rights'
export const PAID_LABEL = 'Paid'
export const REGISTER_JOB = 'What. Who. Rights. Then pay to post.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'When data moves into AI or supply workflows, buyers need a receipt that says where it came from, under what consent, and who contributed it — not a spreadsheet promise. Register provenance once; audit it later.'

export const BUSINESS_CASE_WHO =
  'Data marketplaces, AI labs, and enterprise buyers who must prove lineage (enterprise: compliance / data procurement; grassroots: contributor apps and small providers). Providers pay to register; auditors consume the public receipt.'

export const BUSINESS_CASE_MARKET =
  'DATA Trace (DATA Foundation / IP Strategy, Jun 2026): flagship integrator Kled began registering 1.5 billion user-contributed records on DATA Network; Trace is the public audit / receipt layer (staging API as of docs). Per-record registration fee take-rate is unknown in public pricing.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: DATA Trace + Kled — AI data marketplaces already push provenance registration on-chain at billion-record scale (fee schedule unknown).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Supply-chain / lab LIMS audit trails and enterprise data catalogs — orgs already budget for lineage and consent proof even without a chain.'

export const BUSINESS_CASE_DEMO =
  'Provider registers provenance (fee marked or paid) → buyer/auditor opens a public receipt URL → lineage + consent object proves without a spreadsheet. One visit: register → receipt → audit proof.'

export const BUSINESS_CASE_CITATIONS = [
  { href: 'https://docs.datafdn.org/trace/overview', label: 'DATA Foundation' },
  {
    href: 'https://ir.ipstrategy.co/news-events/press-releases/detail/177/ip-strategy-highlights-story-foundations-transition-to-the',
    label: 'IP Strategy Jun 2026'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export function sheetTitle(what?: string | null): string {
  const trimmed = what?.trim() ?? ''
  return trimmed || DEFAULT_TITLE
}

export function notFoundLine(query: string): string {
  return `No receipt for ${query}.`
}

export function foundLine(what: string): string {
  return what
}

export function registeredStatus(what: string): string {
  return `Registered ${what}.`
}

export const PRIMARY_COPY = [
  EYEBROW,
  DEFAULT_TITLE,
  LEDE,
  LOOKUP_BUTTON,
  REGISTER_BUTTON,
  EMPTY,
  COPY_LINK,
  AMOUNT_IN_ADVANCED,
  FOOTER,
  WHAT_LABEL,
  WHO_LABEL,
  RIGHTS_LABEL,
  PAID_LABEL,
  REGISTER_JOB
] as const
