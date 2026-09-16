const IMARC_HREF =
  'https://www.imarcgroup.com/accounts-receivable-automation-market'
const FMI_HREF =
  'https://www.futuremarketinsights.com/reports/accounts-receivable-automation-market'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">Business case</h2>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>
            Collections is a chase list that must close — not a bank, not a CRM
            feature. Surface what’s overdue, settle or clear the claim, and show
            Paid / closed, with proof of who owes what — without confusing “who
            owes us” with custody of cash.
          </dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>
            AR managers, controllers, and SMB owners buying collections
            priority. Freelancers who just need “who still owes me” without
            full accounting software.
          </dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>
              AR automation software ~$3.0–3.2B in 2025 (IMARC / FMI
              estimates). Lending-marketplace volumes are not desk TAM.
              Collections-only SKU ARR is unknown.
            </p>
            <p className="cite-chips">
              <a
                className="cite-chip"
                href={IMARC_HREF}
                target="_blank"
                rel="noreferrer"
              >
                IMARC
              </a>
              <a
                className="cite-chip"
                href={FMI_HREF}
                target="_blank"
                rel="noreferrer"
              >
                FMI
              </a>
            </p>
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>
                Other-chain analog: Figure’s DART + Connect as a shared claim
                registry (major banks / IMBs, Mar 2025).
              </li>
              <li>
                Non-chain analog: BILL and AR/collections software — BILL FY25
                core revenue $1.30B.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>
            Overdue item surfaces → payer settles (or claim clears) → desk
            shows Paid / closed.
          </dd>
        </div>
      </dl>
    </section>
  )
}
