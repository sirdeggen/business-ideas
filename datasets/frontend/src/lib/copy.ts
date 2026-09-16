export const TITLE = 'Dataset stall'
export const EYEBROW = 'Catalog'
export const LEDE = 'Post a listing. Pay a little to take the file.'
export const STALL_HEADING = 'The stall'
export const EMPTY_LIST = 'No listings yet.'
export const BUY_BUTTON = 'Get the file.'
export const POST_HEADING = 'Post a listing'
export const POST_JOB = 'Title, license, the file, and a price.'
export const POST_BUTTON = 'Post a listing'
export const RECEIPT_HEADING = 'Receipt'
export const PAID_LINE = 'Paid'
export const PAID_STATUS = 'Paid. Here’s the file.'
export const PAID_WAIT = 'Paid. The seller sends the file on Message Box.'
export const FOOTER = 'Not a radio network. Not a crawler paywall.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Sellers of files and dumps need a stall: list title, license, and price; keep the bytes off the public row; unlock the file only after pay. Buyers (labs, analysts) want a sample hash and a receipt — not another free scrape wall or API key negotiation.'

export const BUSINESS_CASE_WHO =
  'Primary GTM — buyers: AI labs and analysts who pay per dump for licensed training, web, or curated data. Secondary — sellers: data brokers and indie curators who list (listing fee and/or take rate on unlock). GTM leads with lab/analyst buyers.'

export const BUSINESS_CASE_MARKET =
  'Grass (official Jul 2026 holder call): $17M revenue in 2025; ~$17M in H1 2026 alone; full-year 2026 training-data outlook ~$65–75M. Non-chain data marketplaces (AWS Data Exchange, Bright Data, and peers) exist; public stall-level GMV for “pay-for-dump” catalogs is unknown beyond named sellers.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Grass — AI labs already pay for ethically sourced web/training data collected via a distributed network; disclosed multi-million revenue.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: AWS Data Exchange / commercial data brokers and dataset marketplaces — enterprises buy licensed dumps and feeds with invoices, not free torrents.'

export const BUSINESS_CASE_DEMO =
  'Post a listing (title, license, sample hash, price) → lab pays → file arrives privately → receipt on the public stall. Catalog readable with no wallet.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://www.grass.io/learn/july-7-grass-token-holder-and-network-participant-call/',
    label: 'Grass Jul 2026'
  },
  {
    href: 'https://aws.amazon.com/data-exchange/',
    label: 'AWS Data Exchange'
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
  STALL_HEADING,
  EMPTY_LIST,
  BUY_BUTTON,
  POST_HEADING,
  POST_JOB,
  POST_BUTTON,
  RECEIPT_HEADING,
  PAID_LINE,
  PAID_STATUS,
  FOOTER
] as const
