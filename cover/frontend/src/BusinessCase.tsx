import type { ReactNode } from 'react'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY
} from './lib/copy'

const FIELD_BODY: Record<(typeof BUSINESS_CASE_FIELDS)[number], ReactNode> = {
  'Why it exists': BUSINESS_CASE_WHY,
  'Who pays': BUSINESS_CASE_WHO,
  'Market signal': (
    <>
      <p>{BUSINESS_CASE_MARKET}</p>
      <p className="cite-chips">
        {BUSINESS_CASE_CITATIONS.map((cite) => (
          <a
            key={cite.label}
            className="cite-chip"
            href={cite.href}
            target="_blank"
            rel="noreferrer"
          >
            {cite.label}
          </a>
        ))}
      </p>
    </>
  ),
  'Proof people pay': (
    <ul>
      <li>{BUSINESS_CASE_PROOF_CHAIN}</li>
      <li>{BUSINESS_CASE_PROOF_FIAT}</li>
    </ul>
  ),
  'Demo goal': BUSINESS_CASE_DEMO
}

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">{BUSINESS_CASE_TITLE}</h2>
      <dl>
        {BUSINESS_CASE_FIELDS.map((label) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{FIELD_BODY[label]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
