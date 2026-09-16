const GIVING_USA_HREF =
  'https://givingusa.org/giving-usa-2025-u-s-charitable-giving-grew-to-592-50-billion-in-2024-lifted-by-stock-market-gains/'
const DAF_REPORT_HREF =
  'https://cffound.org/2020/wp-content/uploads/2025/12/AnnualDAFReport2025-DAFResearchCollaborative.pdf'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">Business case</h2>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>
            Funders give money for a purpose and need a receipt that ties the
            gift to that purpose — not a vague donation acknowledgment.
            Purpose-bound proof should travel with the gift without a custom
            grant portal.
          </dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>
            Foundations, DAFs, corporate CSR, and grassroots donors who restrict
            gifts; nonprofits and project leads who must show purpose-bound
            receipt.
          </dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>
              U.S. charitable giving was $592.5B in 2024 (Giving USA 2025);
              foundation giving $109.8B. DAFs held $326.5B and granted $64.9B
              in FY2024. Share that is strictly purpose-bound is unknown in
              public aggregates.
            </p>
            <p className="cite-chips">
              <a
                className="cite-chip"
                href={GIVING_USA_HREF}
                target="_blank"
                rel="noreferrer"
              >
                Giving USA 2025
              </a>
              <a
                className="cite-chip"
                href={DAF_REPORT_HREF}
                target="_blank"
                rel="noreferrer"
              >
                Annual DAF Report 2025
              </a>
            </p>
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>
                Other-chain analog: Gitcoin and on-chain grant rounds show
                donors already move restricted gifts digitally.
              </li>
              <li>
                Non-chain analog: Grant-management and DAF platforms (Fluxx,
                Blackbaud, DAF sponsors) are paid products for receipting and
                restriction.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>
            Funder sends a purpose-tagged grant; grantee gets a receipt bound
            to that purpose; both can show the restriction later.
          </dd>
        </div>
      </dl>
    </section>
  )
}
