const SIMPLY_RAFFLE_HREF = 'https://simplyraffle.com/business/corporate.html'
const RANDOM_PICKER_HREF =
  'https://www.randompicker.com/tips-and-tools/virtual-raffles-employees/'
const MEETING_PULSE_HREF = 'https://meetingpulse.net/raffle/'

export function BusinessCase() {
  return (
    <section className="business-case" aria-labelledby="business-case-heading">
      <h2 id="business-case-heading">Business case</h2>
      <dl>
        <div>
          <dt>Why it exists</dt>
          <dd>
            Company offsites need a fair, in-room draw: free stubs, one winner, everyone present can see the result. Paper tombolas lose stubs; opaque “random” spreadsheets invite arguments. A digital stub book with a live draw is the fix — not a paid lottery.
          </dd>
        </div>
        <div>
          <dt>Who pays</dt>
          <dd>
            People ops and event hosts at companies running offsites; meetup and club organizers who run a free prize draw. Guests do not buy tickets — the host buys the software (or uses a free tool).
          </dd>
        </div>
        <div>
          <dt>Market signal</dt>
          <dd>
            <p>
              Public TAM for company-offsite free-stub raffle software is unknown. Category proof is product existence and paid plans (SimplyRaffle, RandomPicker, MeetingPulse raffle), not a published market size. On-chain raffle GMV for this use case is unknown.
            </p>
            <p className="cite-chips">
              <a
                className="cite-chip"
                href={SIMPLY_RAFFLE_HREF}
                target="_blank"
                rel="noreferrer"
              >
                SimplyRaffle
              </a>
              <a
                className="cite-chip"
                href={RANDOM_PICKER_HREF}
                target="_blank"
                rel="noreferrer"
              >
                RandomPicker
              </a>
              <a
                className="cite-chip"
                href={MEETING_PULSE_HREF}
                target="_blank"
                rel="noreferrer"
              >
                MeetingPulse
              </a>
            </p>
          </dd>
        </div>
        <div>
          <dt>Proof people pay</dt>
          <dd>
            <ul>
              <li>
                Non-chain analog (paid SaaS): Corporate raffle apps (SimplyRaffle, RandomPicker, MeetingPulse) — orgs already pay for roster import, QR entry, projector reveal, and audit logs for employee prize draws.
              </li>
              <li>
                Non-chain analog (baseline): Paper stubs and hat-draws — the zero-software default this product replaces when fairness and audit matter.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Demo goal</dt>
          <dd>
            Host commits (starts an event they’d pay software for) → guests take free stubs → live fair draw in the room → named winner + audit proof Legal/People Ops can keep. Not a sold raffle or casino.
          </dd>
        </div>
      </dl>
    </section>
  )
}
