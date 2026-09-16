import { protocolFeeSats, type KyaStatus } from '../../../protocol/kya'

export const JOB = 'Verify who’s behind an agent before it acts.'
export const EYEBROW = 'Proof'
export const PRODUCT = 'Know Your Agent'
export const REGISTER_BUTTON = 'Register'
export const ISSUE_BUTTON = 'Issue'
export const VERIFY_BUTTON = 'Verify'
export const REGISTERING_BUTTON = 'Registering…'
export const ISSUING_BUTTON = 'Issuing…'
export const VERIFYING_BUTTON = 'Verifying…'
export const REGISTER_JOB = 'Name the agent and who stands behind it.'
export const ISSUE_JOB = 'Issue the signed credential for this agent.'
export const VERIFY_JOB = 'Pay a little to verify who stands behind this agent.'
export const STRANGER_LINE = 'Anyone with this link can read the credential. No wallet to look.'
export const STAMP_REGISTERED = 'Bound'
export const STAMP_ISSUED = 'Issued'
export const STAMP_VERIFIED = 'Verified'
export const NOT_OWNER = 'This wallet didn’t register the agent.'
export const NO_CREDENTIAL = 'Issue the credential before anyone can verify.'
export const FEE_LINE = 'A tiny protocol fee is labeled separately from the verify fee.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Before an agent spends, attests, or acts for an org, counterparties need to know which agent it is and who stands behind it — agent identity as an audit object, not a passport cosplay.'

export const BUSINESS_CASE_WHO =
  'Primary GTM: enterprise risk / compliance / platform trust teams that budget for agent verification and continuous monitoring before spend or attest (card networks, wallets, marketplaces, agent platforms). Grassroots: small orgs running agents who need the same look-up. End fee schedules for KYA-as-a-product are still forming — public product ARR is unknown.'

export const BUSINESS_CASE_MARKET =
  'Visa + Mastercard + Ant International (Sep 2026): collaboration on a Know-Your-Agent interoperability framework linking Visa Trusted Agent Protocol, Mastercard Verifiable Intent, and Ant’s Agentic Mobile Protocol — operator traceability, shared certification, continuous monitoring. Public KYA fee / revenue figures are unknown. Ant cites Alipay+ scale (150M merchants, 2B user accounts) as the wallet/merchant surface agents would ride; that is ecosystem size, not KYA revenue.'

export const BUSINESS_CASE_PROOF_NETWORK =
  'Network analog (not other-chain): Card-network Trusted Agent / Verifiable Intent / AMP KYA stacks — Visa, Mastercard, and Ant already investing in agent identity rails before spend (fee take unknown).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: KYC/KYB vendors, vendor-risk platforms, OAuth app reviews — orgs already pay for “who is this counterparty?” before access or spend.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Emerging on-chain standards (e.g. draft ERC-8004) exist; public paid product revenue for on-chain agent identity is unknown — not treated as proof until a fee signal appears.'

export const BUSINESS_CASE_DEMO =
  'Org registers an agent with a named backer → counterparty looks up the trust object before a spend/attest → pass/fail is readable on one URL (fee or monitoring charge marked even if v0 is free). One visit: register → look up → trust proof.'

export const BUSINESS_CASE_PROOF = [
  BUSINESS_CASE_PROOF_NETWORK,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_PROOF_CHAIN
] as const

export const BUSINESS_CASE_CITATIONS: ReadonlyArray<{ href: string, label: string }> = []

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

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

export function stampFor(status: KyaStatus): string {
  switch (status) {
    case 'issued':
      return STAMP_ISSUED
    case 'verified':
      return STAMP_VERIFIED
    default:
      return STAMP_REGISTERED
  }
}

export function feeStory(verifySats: number): string {
  return `${FEE_LINE} Protocol fee ${protocolFeeSats(verifySats)} sats.`
}
