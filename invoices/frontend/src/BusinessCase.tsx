const BILL_FY25_HREF =
  'https://investor.bill.com/news/news-details/2025/BILL-Reports-Fourth-Quarter-and-Fiscal-Year-2025-Financial-Results-and-Announces-300-Million-Share-Repurchase-Program/default.aspx'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">Business case</h2>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>
            Send a payable, get paid, keep a clean receipt — without chasing
            email. One shared URL closes the loop: the payer settles, the page
            says Paid, and both sides hold the same artifact. Built for
            volunteer treasurers and boards as much as for finance ops.
          </dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>
            SMBs and mid-market AP buyers who already pay for bill-pay tools;
            freelancers who invoice one-by-one; volunteer treasurers at
            churches, clubs, and HOAs whose boards need an audit-readable
            receipt.
          </dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>
              BILL reported FY25 total revenue of $1.46B (year ended Jun 30,
              2025); Q4 FY25 payment volume $86B. Broader AP automation often
              cited ~$3.8B in 2025. Share of invoice volume that settles
              on-chain is unknown.
            </p>
            <p className="cite-chips">
              <a
                className="cite-chip"
                href={BILL_FY25_HREF}
                target="_blank"
                rel="noreferrer"
              >
                BILL FY25
              </a>
            </p>
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>
                Other-chain analog: Crypto invoicing products exist; public
                revenue for a clear Bill.com peer on-chain is unknown.
              </li>
              <li>
                Non-chain analog: BILL’s $1.46B FY25 revenue shows businesses
                pay for send-payable / get-paid rails; Melio, Stripe Invoicing,
                and QuickBooks AR are the same habit.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>
            Text a stranger the URL; they pay from a second device; a third
            person sees Paid — without claiming full AP automation.
          </dd>
        </div>
      </dl>
    </section>
  )
}
