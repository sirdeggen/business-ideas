/** Status after a successful Spend. Names the payee; never says sats. */
export function paidLine(payeeName?: string): string {
  const name = payeeName?.trim()
  return name ? `Paid ${name}` : 'Paid.'
}

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Treasurers need to let someone spend without handing them the whole purse. A written policy (allowed payees, daily cap, expiry) plus a spend that only clears if the policy allows turns “trust me” into a checkable rule strangers can read.'

export const BUSINESS_CASE_WHO =
  'Finance teams that issue scoped cards or allowance rules to employees and agents; grassroots clubs that give a volunteer a capped float. The buyer is the policy author (treasurer / finance), not the spender.'

export const BUSINESS_CASE_MARKET =
  'Rain (Jan 2026 Series C): $250M raised at $1.95B valuation; >$3B annualized payment volume across 200+ partners; scoped / agent control cards are a named product line. Ramp (Fortune, Sep 2025): ~$1B annualized revenue as a card + spend-management platform. Demo share of “policy-before-spend” GMV is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Rain scoped virtual cards + Agent Control Layer — partners already issue merchant/MCC/amount/expiry-limited cards for humans and agents.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Ramp / Brex / Expensify Card merchant rules and spend limits — companies pay for “this person may only spend X at Y.”'

export const BUSINESS_CASE_DEMO =
  'Write a policy (payees, daily cap, expiry) → stranger reads it → spender pays only if allowed; over-cap or wrong payee is refused before payment.'

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const
