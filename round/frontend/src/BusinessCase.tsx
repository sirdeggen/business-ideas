import { useState } from 'react'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY
} from './lib/copy'

function CiteChips({ ids }: { ids: readonly string[] }) {
  const chips = BUSINESS_CASE_CITATIONS.filter((cite) => ids.includes(cite.id))
  return (
    <p className="cite-chips">
      {chips.map((cite) => (
        <a key={cite.id} className="cite-chip" href={cite.href} target="_blank" rel="noreferrer">
          {cite.label}
        </a>
      ))}
    </p>
  )
}

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
          <dt>Who pays</dt>
          <dd>{BUSINESS_CASE_WHO}</dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>{BUSINESS_CASE_MARKET}</p>
            <CiteChips ids={['coinbase', 'reuters', 'defillama']} />
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>{BUSINESS_CASE_PROOF_CHAIN}</li>
              <li>{BUSINESS_CASE_PROOF_FIAT}</li>
            </ul>
            <CiteChips ids={['gate']} />
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>{BUSINESS_CASE_DEMO}</dd>
        </div>
      </dl>
      <div className="sources">
        <h3>Sources</h3>
        <ul>
          {BUSINESS_CASE_CITATIONS.map((cite) => (
            <li key={cite.id}>
              <a href={cite.href} target="_blank" rel="noreferrer">{cite.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
