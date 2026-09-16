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
            gift to that purpose — not a vague donation acknowledgment. A
            purpose-bound grant receipt makes “this was for X” portable: grantee
            proves they received restricted funds; funder keeps an audit trail
            without a custom grant portal.
          </dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>
            Foundations, DAFs, corporate CSR, and grassroots donors who restrict
            gifts; nonprofits and project leads who must show purpose-bound
            receipt. Enterprise grantmakers already buy grant-management
            software; grassroots campaigns want the same proof without
            enterprise tooling.
          </dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>
              U.S. charitable giving <strong>$592.5B in 2024</strong> (Giving
              USA 2025); foundation giving <strong>$109.8B</strong>. DAFs held{' '}
              <strong>$326.5B</strong> and granted <strong>$64.9B</strong> in
              FY2024 (Annual DAF Report 2025). Share that is strictly
              “restricted / purpose-bound” vs unrestricted is{' '}
              <strong>unknown</strong> in public aggregates — what would prove
              it: IRS/Form 990 restricted-net-asset totals or funder software
              ARPU tied to restricted-gift modules.
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
                Other-chain analog: Gitcoin / on-chain grant rounds prove donors
                pay fees and grantees accept crypto grants; protocol-level
                “restricted gift receipt” revenue is <strong>unknown</strong>.
              </li>
              <li>
                Non-chain analog: Foundations and DAFs already operate at
                nine-figure annual grant outflows; grant-management and
                receipting tools (Fluxx, Blackbaud, DAF sponsor platforms) are
                paid products — exact restricted-gift software TAM{' '}
                <strong>unknown</strong> from open sources here.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>
            Prove a v0: funder sends a purpose-tagged grant → grantee gets a
            receipt bound to that purpose → both can show the restriction later.
            Not a full grants CRM.
          </dd>
        </div>
      </dl>
    </section>
  )
}
