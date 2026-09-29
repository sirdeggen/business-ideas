export const TITLE = 'Closing Desk'
export const EYEBROW = 'Closing'
export const LEDE = 'A shared record of a purchase closing in sats. A changed payee is flagged on the receipt.'
export const PRODUCT = 'Closing Desk'
export const OPEN_BUTTON = 'Open the closing'
export const ATTACH_BUTTON = 'Attach the deed'
export const ATTACHING_BUTTON = 'Attaching…'
export const ATTEST_BUTTON = 'Seller attests'
export const CHECK_BUTTON = 'Check the hash'
export const SWAP_BUTTON = 'Swap the payee'
export const RELEASE_BUTTON = 'Release'
export const RECORD_BUTTON = 'Record this closing'
export const RECORDING_BUTTON = 'Recording…'
export const OPEN_JOB = 'Name the purchase, the amount in sats, and who is named as payee. That name is bound on the receipt.'
export const DEED_JOB = 'Add the deed or assignment. The seller attests the hash.'
export const SWAP_JOB = 'A new wire instruction shows up. One person cannot change the payee. If the parties approve, the receipt flags the change.'
export const RELEASE_JOB = 'The parties say yes. Then you can write the release receipt, with any payee change flagged on it.'
export const RECEIPT_NOTE = 'This demo records and attests a shared closing receipt. It does not move funds.'
export const PAYEE_HELPER = 'The receipt names this seller as payee. A later change needs the parties. The receipt flags that change. An amendment fee applies if you set one.'
export const PARTY_CHANGE_HELPER = 'Or the parties can approve a change. The receipt flags it.'
export const LOCAL_ROLES_NOTE = 'Approvals and the seller attestation are unsigned clicks on a role, not wallet signatures. The quorum is a local simulation. Party keys here are derived from the name: 02 plus the SHA-256 of the name, not real keys.'
export const AMOUNT_LABEL = 'Closing amount (sats)'
export const RECORD_JOB = 'The closing is done here. A wallet only writes the public record.'
export const STRANGER_LINE = 'Anyone with this link can read the closing. No wallet to look.'
export const FOOTER = 'Not a job with milestones. Not a marketplace handoff. One purchase closing.'
export const BUYER_NAME = 'Buyer'
export const SELLER_NAME = 'Seller'
export const AGENT_NAME = 'Closing agent'
export const DEFAULT_LABEL = 'Mineral interest'
export const STAMP_BOUND = 'Payee bound'
export const STAMP_CHANGED = 'Payee change flagged'
export const STAMP_RELEASED = 'Released'
export const LINE_AMOUNT = 'Closing amount'
export const LINE_BPS = 'Fee (basis points, 100 = 1%)'
export const LINE_FEE = 'Fee sats'
export const LINE_AMENDMENT = 'Amendment fee'
export const LINE_NET = 'Net to payee'
export const PARTIES_HEADING = 'Parties'
export const APPROVALS_LABEL = 'Approvals'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'High-value purchases (property, mineral interests, domains, equipment) still get diverted by last-minute payee changes and fake wire instructions. Buyers and sellers need one shared record of who the payee is, which deed or document is being sold, and who approved the closing, so a changed payee stands out before anyone wires money.'

export const BUSINESS_CASE_WHO =
  'Buyers, sellers, and closing agents on mid-to-high-ticket transfers; grassroots property buyers and enterprise mineral/real-estate desks that already pay escrow or title fees.'

export const BUSINESS_CASE_MARKET =
  'Escrow.com publishes percentage escrow fees (roughly 0.89%–3.25% of transaction value). Traditional title/closing fees are commonly cited in the ~$1,200–$3,500 range for many residential closings. Prior Permian mineral wire-fraud research documented multi-million diversions and product gaps (bound payee, deed hash, multi-party release).'

export const BUSINESS_CASE_PROOF =
  'Other-chain analog: thinner direct comps; Immunefi-style escrowed security payouts (~$75k/30d) show people pay for bonded release flows. Non-chain analog: Escrow.com fee schedule; title company closing fees for holding and releasing purchase funds.'

export const BUSINESS_CASE_PROOF_CHAIN = BUSINESS_CASE_PROOF.slice(0, BUSINESS_CASE_PROOF.indexOf(' Non-chain'))

export const BUSINESS_CASE_PROOF_FIAT = BUSINESS_CASE_PROOF.slice(BUSINESS_CASE_PROOF.indexOf('Non-chain'))

export const BUSINESS_CASE_DEMO =
  'Record a closing with a bound payee, a deed/doc hash, and a seller attestation, collect multi-party approvals, and show a receipt that flags any payee change afterward, with the fee shown in bps. v0 records and attests; it does not hold or move funds.'

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
  DEED_JOB,
  SWAP_JOB,
  RELEASE_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER
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

export function payeeFlagLine(from: string, to: string): string {
  return `Payee change flagged: ${from} is now ${to}.`
}

export function approvalLine(count: number, threshold: number): string {
  return `${APPROVALS_LABEL} ${count} of ${threshold}`
}

export function roleLabel(role: 'buyer' | 'seller' | 'agent', name: string): string {
  if (role === 'buyer') return name || BUYER_NAME
  if (role === 'seller') return name || SELLER_NAME
  return name || AGENT_NAME
}
