import { useState } from 'react'
import {
  BUSINESS_CASE_BUYER,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TAM,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHY
} from './lib/copy'

export function BusinessCase() {
  const [expanded, setExpanded] = useState(true)
  return (
    <details
      className="business-case"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>{BUSINESS_CASE_WHY}</dd>
        </div>
        <div>
          <dt>TAM</dt>
          <dd>
            <p>{BUSINESS_CASE_TAM}</p>
          </dd>
        </div>
        <div>
          <dt>Buyer</dt>
          <dd>{BUSINESS_CASE_BUYER}</dd>
        </div>
        <div>
          <dt>Analog proof</dt>
          <dd>
            <ul>
              <li>{BUSINESS_CASE_PROOF_CHAIN}</li>
              <li>{BUSINESS_CASE_PROOF_FIAT}</li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>{BUSINESS_CASE_DEMO}</dd>
        </div>
      </dl>
    </details>
  )
}
