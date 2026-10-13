export const TITLE = 'Bounty Desk'
export const EYEBROW = 'Bounty'
export const LEDE = 'Fund a severity-tiered bounty pool. Post a report hash. Release the matching tier.'
export const PRODUCT = 'Bounty Desk'
export const FUND_BUTTON = 'Fund the pool'
export const SUBMIT_BUTTON = 'Post the hash'
export const RELEASE_BUTTON = 'Release this tier'
export const EXPORT_BUTTON = 'Export the timeline'
export const RECORD_BUTTON = 'Record on the public book'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const ACK_BUTTON = 'Acknowledge'
export const FIXED_BUTTON = 'Mark fixed'
export const DISCLOSED_BUTTON = 'Disclose'
export const COPY_REPORT_BUTTON = 'Copy the report'
export const FUND_JOB = 'Name the project and the scope. Set a sat amount on each severity tier. No wallet yet.'
export const SUBMIT_JOB = 'Write the report here. The desk posts a hash so you can prove you were first. The body stays off the chain.'
export const RELEASE_JOB = 'A triage verdict pays the matching tier from the pool. The desk fee is withheld from that tier.'
export const TIMELINE_JOB = 'Add the disclosure clock in order: received, acknowledged, fixed, disclosed. The order is a desk record.'
export const EXPORT_JOB = 'Export the timeline for a CRA-style 24h, 72h, and 14-day clock. The file is a record, not legal advice.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record.'
export const HASH_NOTE = 'The report body never goes on-chain. Only its hash does. Send the full report privately over Message Box.'
export const SCRIPT_NOTE = 'The pool lock is what the script enforces: only the project key can spend it. A recorded verdict pays the researcher the tier minus the desk fee. The script does not read the severity label.'
export const DESK_NOTE = 'Hash priority and the disclosure timeline are desk records. They are not written into the locking script.'
export const EXPORT_NOTE = 'This export is a record of those timestamps. It is not legal compliance advice.'
export const FEE_HELPER = 'The payout fee is a percent of the tier, priced under 10%. 800 basis points is 8%. The researcher also pays a per-submission fee. The timeline export has its own fee.'
export const LOCAL_NOTE = 'The walkthrough keeps the pool in this browser. Record on the public book locks the remaining pool to the project key and posts the hash. The report body is not in that transaction. v0 does not collect the submission fee or the export fee into a platform key. The payout fee is withheld from the researcher and stays in the project lock.'
export const STRANGER_LINE = 'Anyone with this link can read the pool, the hash, and the timeline. No wallet to look.'
export const FOOTER = 'Not a hired job. Not a purpose-bound gift. Not an insurance claim. Not a staked attestation. A tiered pool, a hash before the report, and a disclosure clock.'
export const BOOK_EMPTY = 'No pools on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const PROJECT_LABEL = 'Project'
export const SCOPE_LABEL = 'Scope'
export const RESEARCHER_LABEL = 'Researcher'
export const REPORT_LABEL = 'Report'
export const TIER_LABEL = 'Tier'
export const PAYOUT_BPS_LABEL = 'Payout fee (basis points)'
export const SUBMISSION_FEE_LABEL = 'Submission fee (sats)'
export const EXPORT_FEE_LABEL = 'Export fee (sats)'
export const LINE_POOL = 'Pool'
export const LINE_TIER = 'Tier sats'
export const LINE_FEE = 'Desk fee'
export const LINE_RESEARCHER = 'Researcher sats'
export const LINE_LEFT = 'Unreleased tiers'
export const LINE_LOCK = 'Still locked to the project'
export const LINE_SUBMISSION = 'Submission fee'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Software and device makers selling into the EU need a disclosure clock they can show, and open-source maintainers need a bounty without a large platform contract. A researcher should be able to prove they reported first without publishing the bug.'

export const BUSINESS_CASE_WHO =
  'Projects fund the severity-tiered pool and pay a percentage of each payout. Researchers pay a small anti-spam fee to post a hash. Compliance teams pay to export the disclosure timeline.'

export const BUSINESS_CASE_MARKET =
  'Immunefi (DefiLlama, 2026-10-13): ~$67k / 30d from researcher submission and identity-verification fees (~$383k trailing 1y). Projects also pay a 10% fee on payouts. Bug bounty and vulnerability disclosure on X ~2,709 posts / 7d. EU Cyber Resilience Act reporting duty live since 11 Sep 2026: early warning 24h, full notice 72h, final report 14 days after a fix. Share of that market this desk can take is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Immunefi researcher submission fees plus a 10% project fee on payouts. Hats Finance lists 5–8% of payouts (secondary source).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: HackerOne managed programs at $20k–$100k+ per year. Manufacturers already staff disclosure and regulatory reporting.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'Fund a severity-tiered pool, post a report hash, release the matching tier, and export the disclosure timeline. The report body stays off-chain. The export is a record, not legal advice.'

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
  FUND_BUTTON,
  FUND_JOB,
  SUBMIT_JOB,
  RELEASE_JOB,
  TIMELINE_JOB,
  EXPORT_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  HASH_NOTE,
  SCRIPT_NOTE,
  DESK_NOTE,
  EXPORT_NOTE
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

export function tierLabel(tier: string): string {
  if (!tier) return tier
  return tier.slice(0, 1).toUpperCase() + tier.slice(1)
}
