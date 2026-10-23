export const TITLE = 'Round Desk'
export const EYEBROW = 'Round'
export const LEDE = 'Run a raise with a minimum, a maximum, and a deadline. Backers commit. v0 holds the escrow in the issuer\'s custody, and a refund is only computed.'
export const PRODUCT = 'Round Desk'
export const OPEN_BUTTON = 'Open the raise'
export const DISCLOSE_BUTTON = 'Prove eligibility'
export const COMMIT_BUTTON = 'Commit to escrow'
export const CLOSE_BUTTON = 'Close the raise'
export const RECORD_BUTTON = 'Record on the public book'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const HANDOFF_BUTTON = 'Download the register handoff'
export const OPEN_JOB = 'Name the business, co-op, or startup. Pick a fixed price or a clearing-price auction. Set the minimum, the maximum, and the deadline. No wallet yet.'
export const DISCLOSE_JOB = 'A backer shows only the fields this raise asked for. Anything else stays off the record.'
export const COMMIT_JOB = 'Commit sats into the issuer\'s escrow. A fixed price uses the price you set. A clearing auction uses the bid, which has to meet the reserve. The backer\'s wallet does not fund this output in v0.'
export const CLOSE_JOB = 'At the deadline, a raise under the minimum computes a refund for every backer. At or over the minimum, the allocation is computed in the open, up to the maximum. v0 does not spend that refund.'
export const HANDOFF_JOB = 'A settled raise hands the holdings to the register. This desk does not transfer them onward.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record.'
export const SCRIPT_NOTE = 'v0 escrow is issuer custody. The issuer\'s wallet funds every commitment, locked to a key anyone can re-derive from the issuer, and only that issuer can spend it. Backers do not fund or sign those outputs, and there is no on-chain refund spend. The script does not read the minimum, the maximum, the deadline, or who is eligible.'
export const DESK_NOTE = 'Eligibility, the clearing price, the refund, and the allocation are computed from the signed records and written in the open. A time written in the record does not set the order or the deadline. The public book trusts the overlay host\'s lookup context for admission time. That context is not a merkle proof or a block header. When the host sends no time, the raise stays pending and is not read as a refund. The issuer\'s wallet sets nLockTime. It is not the backer\'s clock, and with final sequence numbers it does not hold the transaction. A lock time proves nothing about when a transaction was published. OP_PUSH_TX enforcement of the payout outputs is v1 work. On a settled close, the holdings are handed to the register. This desk does not run a secondary market.'
export const LOCAL_NOTE = 'The walkthrough keeps the raise in this browser. Record is the issuer\'s wallet: it funds every commitment and signs every record. v0 computes the refund and the allocation. It does not spend a refund, and it does not force those payout outputs inside the locking script.'
export const STRANGER_LINE = 'Anyone with this link can read the raise, the disclosed fields, and the allocation. No wallet to look.'
export const FOOTER = 'A raise for a business, a co-op, or a startup. No token market and no secondary trading.'
export const BOOK_EMPTY = 'No raises on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const NAME_LABEL = 'Raise'
export const ORG_LABEL = 'Who is raising'
export const PRICING_LABEL = 'Price'
export const UNIT_LABEL = 'What is issued'
export const PRICE_LABEL = 'Price or reserve (sats per unit)'
export const MIN_LABEL = 'Minimum (sats)'
export const MAX_LABEL = 'Maximum (sats)'
export const DEADLINE_LABEL = 'Deadline'
export const BACKER_LABEL = 'Backer'
export const CERTIFIER_LABEL = 'Certifier'
export const TYPE_LABEL = 'Certificate type'
export const SERIAL_LABEL = 'Serial'
export const SATS_LABEL = 'Commitment (sats)'
export const BID_LABEL = 'Bid (sats per unit)'
export const SCENE_ALT = 'A man and a woman review a raise card labeled Minimum, Maximum, and Deadline in a bright modern workshop, with a train and cars visible through the glass.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'A local business, co-op, or startup should be able to raise from people who can show they are eligible, without turning the raise into a token market.'

export const BUSINESS_CASE_WHO =
  'The business running the raise pays a percentage of a successful raise; backers pay a small fee per eligibility check. v0 shows the fee but does not charge it.'

export const BUSINESS_CASE_MARKET =
  'Echo raised $200M+ across ~300 deals by Oct 2025, and Coinbase bought it for ~$375M (Reuters, 21 Oct 2025). DefiLlama shows ~$325k fee revenue over the past year, and it arrives in lumps. Share of community raises this desk can take is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Ethos\'s token sale on Sonar drew $8.4M in bids (Gate News, 7 Sep 2026).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Regulated crowdfunding portals and co-op member-share offerings, where issuers already pay a percentage of the money raised.'

export const BUSINESS_CASE_CITATIONS = [
  {
    id: 'coinbase',
    label: 'Coinbase, 21 Oct 2025',
    href: 'https://www.coinbase.com/blog/coinbase-acquires-echo-unlocking-the-future-of-onchain-capital-formation'
  },
  {
    id: 'reuters',
    label: 'Reuters, 21 Oct 2025',
    href: 'https://www.reuters.com/legal/transactional/coinbase-signs-375-million-deal-crypto-investment-platform-echo-2025-10-21/'
  },
  {
    id: 'defillama',
    label: 'DefiLlama Echo',
    href: 'https://defillama.com/protocol/echo.xyz'
  },
  {
    id: 'gate',
    label: 'Gate News, 7 Sep 2026',
    href: 'https://www.gate.com/news/detail/ethos-whuf-token-auction-concludes-with-84m-in-bids-from-1560-participants-24086179'
  }
] as const

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'Open a fixed-price or clearing-price raise, disclose only the fields the raise asks for, commit into the issuer\'s escrow, and close it. Under the minimum, a refund is computed for every backer. Over the maximum, the allocation is computed in the open. Holdings hand off to the register. There is no secondary trading.'

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
  OPEN_BUTTON,
  OPEN_JOB,
  DISCLOSE_JOB,
  COMMIT_JOB,
  CLOSE_JOB,
  HANDOFF_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  SCRIPT_NOTE,
  DESK_NOTE
] as const

export function formatAmount(amount: number): string {
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

export function orgLabel(kind: string): string {
  if (kind === 'coop') return 'Co-op'
  if (kind === 'startup') return 'Startup'
  if (kind === 'business') return 'Business'
  return kind
}

export function pricingLabel(pricing: string): string {
  return pricing === 'clearing' ? 'Clearing-price auction' : 'Fixed price'
}
