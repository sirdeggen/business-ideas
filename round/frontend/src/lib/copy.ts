export const TITLE = 'Round Desk'
export const EYEBROW = 'Round'
export const LEDE = 'Run a raise with a minimum, a maximum, and a deadline. Backers commit. Under the minimum, everyone is refunded.'
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
export const COMMIT_JOB = 'Commit sats into escrow. A fixed price uses the price you set. A clearing auction uses the bid, which has to meet the reserve.'
export const CLOSE_JOB = 'At the deadline, a raise under the minimum refunds every backer. At or over the minimum, the allocation is computed in the open, up to the maximum.'
export const HANDOFF_JOB = 'A settled raise hands the holdings to the register. This desk does not transfer them onward.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record.'
export const SCRIPT_NOTE = 'Record funds each commitment in an escrow output locked to a key anyone can re-derive from the issuer. Only that issuer can spend that output. The script does not read the minimum, the maximum, the deadline, or who is eligible.'
export const DESK_NOTE = 'Eligibility, the clearing price, the refund, and the allocation are computed from the signed records and written in the open. A time written in the record does not set the order or the deadline. On the public book, the transaction time does. OP_PUSH_TX enforcement of those outputs is v1 work. On a settled close, the holdings are handed to the register. This desk does not run a secondary market.'
export const LOCAL_NOTE = 'The walkthrough keeps the raise in this browser. Record funds each commitment as an escrow output and signs every record so a reader can check it. v0 computes the refund and the allocation. It does not force those payout outputs inside the locking script.'
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
  'The buyer is the local business, co-op, or startup that runs the raise. Backers commit into escrow. v0 does not take a platform cut.'

export const BUSINESS_CASE_MARKET =
  'TAM signal: Reuters reported on 21 October 2025 that Coinbase bought Echo, including its Sonar raise product, for $375 million in cash and stock (https://www.reuters.com/legal/transactional/coinbase-signs-375-million-deal-crypto-investment-platform-echo-2025-10-21/). Share of that market this desk can take is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Analog proof: Gate News reported on 7 September 2026 that Ethos said its sale on Sonar had taken $8.4 million in bids (https://www.gate.com/news/detail/ethos-whuf-token-auction-concludes-with-84m-in-bids-from-1560-participants-24086179). The raise ran on the project’s own terms, with a set of backers, rather than on an open token market.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: co-ops, local businesses, and startups already raise from members and neighbors against a minimum, a cap, and a deadline. Those raises are not a secondary market.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'Open a fixed-price or clearing-price raise, disclose only the fields the raise asks for, commit into escrow, and close it. Under the minimum, every backer is refunded. Over the maximum, the allocation is computed in the open. Holdings hand off to the register. There is no secondary trading.'

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
