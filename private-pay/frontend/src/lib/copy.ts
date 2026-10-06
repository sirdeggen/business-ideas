import {
  AUDIT_VIEW_FEE_SATS,
  PAYMENT_FEE_BPS,
  formatSats
} from '../../../protocol/private-pay'

export const JOB = 'Confidential payments for payroll and suppliers. An auditor sees only the view they were granted.'
export const EYEBROW = 'Private pay'
export const PRODUCT = 'Private Pay Desk'
export const PAY_BUTTON = 'Pay'
export const PAYING_BUTTON = 'Paying…'
export const ATTEST_BUTTON = 'Attest'
export const ATTESTING_BUTTON = 'Attesting…'
export const GRANT_BUTTON = 'Grant view'
export const GRANTING_BUTTON = 'Granting view…'
export const REVOKE_BUTTON = 'Revoke view'
export const REVOKING_BUTTON = 'Revoking view…'
export const OPEN_BUTTON = 'Open view'
export const OPENING_BUTTON = 'Opening view…'
export const EXPORT_BUTTON = 'Export reading'
export const PAY_JOB = 'Name the run, enter the amount, and add the line note. The fee is on the quote. The amount stays sealed.'
export const ATTEST_JOB = 'The payee attests that this payment was received. The attestation is bound to the payment id.'
export const GRANT_JOB = 'Grant an auditor a scoped view of this payment. The grant fee is labeled.'
export const REVOKE_JOB = 'Revoke a view. This desk stops opening it. The sealed bytes stay on the record.'
export const OPEN_JOB = 'Open the sealed amount if this wallet is the payer, the payee, or an auditor with a view that is still open.'
export const STRANGER_LINE = 'Anyone with this link can read the payment id, the fee, and whether a view was granted. No wallet to look. The amount stays sealed.'
export const QUOTE_WAIT = 'Enter an amount in sats to see the payment fee.'
export const PAYMENT_FEE_LABEL = 'Payment fee'
export const GRANT_FEE_LABEL = 'Audit-view grant fee'
export const FEE_FACE = 'The payment fee is basis points of the amount. It is listed on the quote, not taken quietly.'
export const BAND_LINE = `The fee is ${PAYMENT_FEE_BPS} basis points of the amount, rounded down, and at least 1 sat. From the public fee, a reader can estimate the amount to within 400 sats. The exact amount and the line note stay sealed.`
export const SEALED_WORD = 'Sealed'
export const VIEW_GRANTED_WORD = 'View granted'
export const VIEW_CLOSED_WORD = 'View closed'
export const AMOUNT_SEALED = 'Amount sealed'
export const NOT_PAYER = 'This wallet didn’t send the payment.'
export const NOT_PAYEE = 'This wallet isn’t the payee on this payment.'
export const ALREADY_ATTESTED = 'This payment already has an attestation.'
export const ALREADY_GRANTED = 'This auditor already has an open view.'
export const ALREADY_REVOKED = 'This view is already revoked.'
export const NEED_GRANT = 'There is no view to revoke.'
export const NEED_AUDITOR = 'Name the auditor identity key.'
export const NOT_A_VIEW = 'This wallet wasn’t granted a view.'
export const EMPTY_LIST = 'No payments yet.'
export const HONESTY_LINE = 'The payment fee and the audit-view grant fee are paid in sats. The amount and the line note are sealed. A stranger sees the fee, the time, and whether a view was granted. v0 does not pay the sealed amount as a visible output.'
export const DISTINCT_LINE = 'Confidential payments with a scoped auditor view. Not a rule on what a key can spend, and not an org treasury.'
export const DESK_DEFAULT = 'Leave the desk key blank and the payment fee and the audit-view grant fee are paid to this wallet.'
export const PAYEE_HINT = 'Leave the payee keys blank to pay this wallet. Or paste the payee identity key and the payee signing key. The identity key receives the sealed amount. Only the signing key can attest.'
export const KEY_SHAPE = 'A key is 66 hex characters starting with 02 or 03.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Payroll amounts and supplier prices should not be readable by every competitor on a public ledger. Orgs need confidential business payments that still let an auditor or regulator see what they are scoped to see — selective disclosure.'

export const BUSINESS_CASE_WHO =
  'Finance and compliance teams at enterprises and co-ops that settle salaries and supplier invoices on a public rail and must grant auditors a scoped view without publishing every line item to the world.'

export const BUSINESS_CASE_MARKET =
  'Railgun retains about $377k / 30d and Privacy Cash about $144k / 30d (DefiLlama, 2026-10-06). Talk of privacy and selective disclosure on X ran about 11,500 posts in the last 7 days.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Railgun charges 0.25% on shield and unshield and sells viewing keys for read-only disclosure; Privacy Cash holds similar privacy-payment revenue.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: enterprises already pay banks and card networks for confidential settlement and grant auditors scoped access to statements without publishing every line item.'

export const BUSINESS_CASE_DEMO =
  'A payer sends a confidential payment, the payee attests receipt, and an auditor opens a scoped view of only the payments they were granted.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/railgun',
    label: 'DefiLlama, 2026-10-06'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export const SCENE_ALT =
  'A finance lead at a bright desk reviews a payroll run on a laptop, while a second screen shows an auditor with a scoped view granted panel.'

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

export function grantFeeFace(): string {
  return `${GRANT_FEE_LABEL} ${formatSats(AUDIT_VIEW_FEE_SATS)} when a view is granted.`
}

export function viewFlag(granted: boolean, openViews: number): string {
  if (!granted) return 'No view granted'
  if (openViews > 0) return VIEW_GRANTED_WORD
  return VIEW_CLOSED_WORD
}
