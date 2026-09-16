const LIVE_NATION_HREF =
  'https://newsroom.livenation.com/news/live-nation-entertainment-full-year-and-fourth-quarter-2025-results/'
const EVENTBRITE_HREF =
  'https://www.sec.gov/Archives/edgar/data/1475115/000147511526000005/eb-20251231.htm'
const COINDESK_HREF =
  'https://www.coindesk.com/tech/2026/06/17/fifa-wanted-avalanche-s-blockchain-to-help-curb-world-cup-ticket-scalping-here-s-how-it-s-going'

const WHY =
  'Fans need a live credential they can show at the door — not a screenshotable PDF. Organizers need issue → hold → present → redeem (dead after the door), with optional handoff rules that curb bots without building a flip marketplace.'
const WHO =
  'Event organizers and venues; grassroots promoters who sell a night’s door list. Fans pay face value; the product’s buyer is the organizer who pays for issuance/door rails or takes a fee.'
const MARKET =
  'Ticketmaster (Live Nation Ticketing) FY2025: $3.1B ticketing revenue; 346M fee-bearing tickets. Eventbrite 2025: $291.8M net revenue; 258M tickets issued. Demo share of door-credential spend is unknown.'
const PROOF_OTHER =
  'Other-chain analog: FIFA Collect access rights on Avalanche — combined secondary >$25M (match tickets stayed on FIFA’s traditional stack).'
const PROOF_NON =
  'Non-chain analog: Ticketmaster and Eventbrite — billions in fee/GTV prove organizers and fans pay for issue-and-scan rails every year.'
const GOAL =
  'Pay for a ticket → receive a live credential → present at the door → redeem so it is dead. One event, N tickets — handoff as overlay rules, not an NFT floor.'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">Business case</h2>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>{WHY}</dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>{WHO}</dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>{MARKET}</p>
            <p className="cite-chips">
              <a
                className="cite-chip"
                href={LIVE_NATION_HREF}
                target="_blank"
                rel="noreferrer"
              >
                Live Nation FY2025
              </a>
              <a
                className="cite-chip"
                href={EVENTBRITE_HREF}
                target="_blank"
                rel="noreferrer"
              >
                Eventbrite 2025 10-K
              </a>
              <a
                className="cite-chip"
                href={COINDESK_HREF}
                target="_blank"
                rel="noreferrer"
              >
                CoinDesk Jun 2026
              </a>
            </p>
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>{PROOF_OTHER}</li>
              <li>{PROOF_NON}</li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>{GOAL}</dd>
        </div>
      </dl>
    </section>
  )
}
