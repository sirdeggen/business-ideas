import {
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY
} from './lib/copy'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">{BUSINESS_CASE_TITLE}</h2>
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
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
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
    </section>
  )
}
