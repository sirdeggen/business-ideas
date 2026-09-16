import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const raffleCard = catalog.slice(
  catalog.indexOf('href="./raffle/"'),
  catalog.indexOf('</article>', catalog.indexOf('href="./raffle/"'))
)

describe('first-paint copy', () => {
  it('names the offsite and empty states, not overlay jargon', () => {
    expect(app).toContain('This trip’s draw')
    expect(app).toContain("const NO_DRAW_IN_THIS_LINK = 'No draw in this link.'")
    expect(app).toContain('{NO_DRAW_IN_THIS_LINK}')
    expect(app).not.toContain('No raffle in this link.')
    expect(app).not.toContain('setListError(errorMessage(err))')
    expect(app).toContain('Event')
    expect(app).toContain('Northstar offsite, Friday dinner')
    expect(app).toContain('Friday off / the cabin weekend / the jacket')
    expect(app).toContain('Who can enter')
    expect(app).toContain('Take a ticket')
    expect(app).toContain('Pass your stub')
    expect(app).toContain('Draw')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('stays a free offsite draw, not a sold raffle or casino', () => {
    expect(app).toContain('This trip’s draw. Free stub. One winner, in the room.')
    expect(app).toContain('This trip only')
    expect(app).toContain('One per person')
    expect(app).toContain('Must be here to win')
    expect(app).toContain('We draw ')
    expect(app).toContain('Ask {asked}')
    expect(app).toContain('of {header.ticketCount} taken')
    expect(app).toContain('You can pass this stub to a coworker')
    expect(app).toContain('Free. Must be here when we draw.')
    expect(app).toContain('You must be present at the stage during the drawing to claim your prize.')
    expect(app).not.toContain('tickets taken')
    expect(app).not.toContain('Host name')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Event name')
    expect(app).not.toContain('People on this trip')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('ticket price')
    expect(app).not.toContain('% chance')
    expect(app).not.toContain('buy more')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('Live pot')
    expect(app).not.toContain('odds')
    expect(app).not.toContain('50/50')
    expect(app).not.toMatch(/jackpot/i)
    expect(app).not.toMatch(/sweepstake/i)
    expect(app).not.toMatch(/casino/i)
    expect(app).not.toMatch(/\$400/)
    expect(app).not.toMatch(/\bpot\b/i)
    expect(app).not.toMatch(/buy extra/i)
    expect(app).not.toMatch(/whale/i)
  })

  it('hides Pass, hex, and wallet chrome until the guest has a stub', () => {
    expect(app).toContain('const hasStub = Boolean(heldHere || myTickets.length > 0)')
    expect(app).toContain('const showPass = Boolean(canPass && !drawn && hasStub)')
    expect(app).toContain('{showPass && (')
    expect(app).not.toContain('{canPass && !drawn && (')
    expect(app).not.toContain('Wallet key')
    expect(app).not.toContain('shortKey(')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toContain('{shortKey')
  })

  it('shows Install Desktop only when the wallet is missing', () => {
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('const combinedError = actionError || walletError')
    expect(app).not.toContain('Boolean(combinedError) && !overlayDown')
    expect(app).not.toContain('listError')
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('No draw in this link.')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(raffleCard).toContain('class="badge">Server<')
    expect(raffleCard).toContain('>View<')
    expect(raffleCard).toContain('How to run')
    expect(raffleCard).not.toContain('Open UI')
    expect(raffleCard).not.toContain('soon')
    expect(raffleCard).not.toContain('Live')
    expect(raffleCard).not.toContain('eyebrow')
    expect(raffleCard).not.toContain('Business case')
  })
})

describe('Business case page copy is locked', () => {
  const caseFile = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')

  it('uses the exact title and five fields in PATTERN order', () => {
    expect(caseFile).toContain('>Business case<')
    expect(caseFile.indexOf('Why it exists')).toBeLessThan(caseFile.indexOf('Who pays'))
    expect(caseFile.indexOf('Who pays')).toBeLessThan(caseFile.indexOf('Market signal'))
    expect(caseFile.indexOf('Market signal')).toBeLessThan(caseFile.indexOf('Proof people pay'))
    expect(caseFile.indexOf('Proof people pay')).toBeLessThan(caseFile.indexOf('Demo goal'))
  })

  it('keeps the locked bodies and does not dump Margaret, Status, or Sources', () => {
    expect(caseFile).toContain(
      'Company offsites need a fair, in-room draw: free stubs, one winner, everyone present can see the result. Paper tombolas lose stubs; opaque “random” spreadsheets invite arguments. A digital stub book with a live draw is the fix — not a paid lottery.'
    )
    expect(caseFile).toContain(
      'People ops and event hosts at companies running offsites; meetup and club organizers who run a free prize draw. Guests do not buy tickets — the host buys the software (or uses a free tool).'
    )
    expect(caseFile).toContain(
      'Public TAM for company-offsite free-stub raffle software is unknown. Category proof is product existence and paid plans (SimplyRaffle, RandomPicker, MeetingPulse raffle), not a published market size. On-chain raffle GMV for this use case is unknown.'
    )
    expect(caseFile).toContain(
      'Non-chain analog (paid SaaS): Corporate raffle apps (SimplyRaffle, RandomPicker, MeetingPulse) — orgs already pay for roster import, QR entry, projector reveal, and audit logs for employee prize draws.'
    )
    expect(caseFile).toContain(
      'Non-chain analog (baseline): Paper stubs and hat-draws — the zero-software default this product replaces when fairness and audit matter.'
    )
    expect(caseFile).toContain(
      'Host commits (starts an event they’d pay software for) → guests take free stubs → live fair draw in the room → named winner + audit proof Legal/People Ops can keep. Not a sold raffle or casino.'
    )
    expect(caseFile).not.toMatch(/Margaret/)
    expect(caseFile).not.toMatch(/## Sources/)
    expect(caseFile).not.toMatch(/Status:/)
  })

  it('offers at most three citation chips', () => {
    const chips = [...caseFile.matchAll(/className="cite-chip"/g)]
    expect(chips.length).toBeLessThanOrEqual(3)
    expect(caseFile).toContain('SimplyRaffle')
    expect(caseFile).toContain('RandomPicker')
    expect(caseFile).toContain('MeetingPulse')
  })

  it('sits once below the head and above the desk, on the default view only', () => {
    expect(app).toContain('{!raffleId && <BusinessCase />}')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('</header>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('<section className="block">')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
  })
})
