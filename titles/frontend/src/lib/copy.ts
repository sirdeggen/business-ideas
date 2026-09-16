export const TITLE = 'Title desk'
export const EYEBROW = 'Catalog'
export const LEDE = 'Issue a titled document. Transfer the title. Export if you hold it.'
export const LIST_HEADING = 'Titles'
export const EMPTY_LIST = 'No titles yet.'
export const HOLDER_FALLBACK = 'Holder'
export const TRANSFER_BUTTON = 'Transfer title'
export const EXPORT_BUTTON = 'Export'
export const ISSUE_HEADING = 'Issue a title'
export const ISSUE_JOB = 'A title, the document, and a price.'
export const ISSUE_BUTTON = 'Issue a title'
export const TO_LABEL = 'To'
export const HELD_BY = 'Held by'
export const NOT_HOLDER = 'You don’t hold this title.'
export const EXPORTED = 'Exported. Here’s the reading.'
export const FOOTER = 'Not a bank. Not a signed record. Not a dataset stall.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'A titled document is an object someone holds — issue it, transfer who holds the title, export only if you hold it. The pain is “who owns this paper now?” without a fax chain or a PDF anyone can copy.'

export const BUSINESS_CASE_WHO =
  'Issuers (carriers, freight forwarders, document desks, clubs) pay to issue the titled document. Holders or receiving parties pay the transfer / custody fee when title moves. Enterprise document desks and grassroots clubs both open a wallet on that path.'

export const BUSINESS_CASE_MARKET =
  'CargoX platform announcements: more than 10M electronic trade documents transferred by mid-2025, later citing 12M. Exact platform fee take-rate and eBL-only revenue are unknown in public filings.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain / digital-title analog: CargoX Blockchain Document Transfer — carriers and traders already move electronic bills of lading and related titles as transferable documents.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Title insurance workflows, certificate registries, diploma verification portals — budgets already exist for “who holds the title now?”'

export const BUSINESS_CASE_DEMO =
  'Issue a titled document → transfer the title (transfer/custody fee visible) → export only if holder, on a public desk.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://www.linkedin.com/posts/cargox-io_cargox-digitaltrade-paperlesstrade-activity-7351207559980015616-0bPy',
    label: 'CargoX 10M'
  },
  {
    href: 'https://www.linkedin.com/posts/cargox-io_blockchaindocumenttransfer-cargox-electronicdocuments-activity-7426916592652992512-0zKc',
    label: 'CargoX 12M'
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
  HOLDER_FALLBACK,
  TRANSFER_BUTTON,
  EXPORT_BUTTON,
  ISSUE_HEADING,
  ISSUE_JOB,
  ISSUE_BUTTON,
  TO_LABEL,
  HELD_BY,
  NOT_HOLDER,
  EXPORTED,
  FOOTER
] as const
