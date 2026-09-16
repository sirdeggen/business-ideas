export const TITLE = 'Signed record desk'
export const EYEBROW = 'Field readings'
export const LEDE = 'Post a signed reading. Pay a little to export.'
export const BANNER =
  'Hashes are listed for free. Wallet is only asked when you Post or Pay.'
export const POST_HEADING = 'Post a record'
export const POST_JOB =
  'A contributor signs a field reading — hours, an inspection, or a note.'
export const ADVANCED_ACCOUNT =
  'Optional account id. Leave blank to post the name. Only needed if a buyer should pay you on-chain.'
export const EXPORT_HEADING = 'Export a reading'
export const EXPORT_JOB =
  'Pay a little to export the reading. The full note is behind Pay + Export.'
export const EXPORT_BUTTON = 'Pay a little + Export'
export const EXPORT_DONE = 'Paid a little. Reading downloaded.'
export const EMPTY_LIST = 'No signed records yet — post one.'
export const ADVANCED_GATE =
  'The overlay already holds the fields; payment is the gate here.'
export const FOOTER = 'Not tickets, not invoices, not a stamp card.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Someone posts a signed reading. Others who need that reading for downstream work pay a little to export a copy with the signature intact — publish once, pay to take it home, no unlimited free redistribution.'

export const BUSINESS_CASE_WHO =
  'Primary: enterprise data/compliance/ops budgets paying per attributable export. Secondary: grassroots operators collecting export fees. A pay-to-export counter, not a terminal replacement.'

export const BUSINESS_CASE_MARKET =
  'Pyth Pro: ~$2.43M cumulative gross revenue Sep 2025–Jul 2026; July 2026 alone ~$538K. Broader pay-to-export signed-reading TAM is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Pyth Pro — institutions pay subscriptions for signed market data delivery.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Bloomberg Terminal, Refinitiv, and AWS Data Exchange show enterprises pay for attributed data access and export.'

export const BUSINESS_CASE_DEMO =
  'Post a signed reading → buyer pays a small fee → receives an export that still verifies the signature.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://forum.pyth.network/t/pyth-pro-douro-labs-report-july-2026/2660',
    label: 'Pyth Pro July 2026'
  },
  {
    href: 'https://www.pyth.network/marketplace',
    label: 'Pyth Marketplace'
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
  BANNER,
  POST_HEADING,
  POST_JOB,
  EXPORT_HEADING,
  EXPORT_JOB,
  EXPORT_BUTTON,
  EXPORT_DONE,
  EMPTY_LIST,
  FOOTER
] as const
