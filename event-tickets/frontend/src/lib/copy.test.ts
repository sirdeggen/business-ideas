import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_EVENT } from '../../../protocol/ticket'
import { EVENT_NAME, EVENT_PLACE, eventWhenLine, passDateLine } from './copy'

const here = dirname(fileURLToPath(import.meta.url))

function source(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const AFTER_DEMO_NIGHT = Date.parse('2026-08-21T12:00:00Z')

describe('event slip date', () => {
  it('drops Demo Night startsAt when it is already past', () => {
    expect(DEMO_EVENT.startsAt).toBe('2026-08-13T20:00:00Z')
    expect(eventWhenLine(DEMO_EVENT.startsAt, AFTER_DEMO_NIGHT)).toBeNull()
  })

  it('keeps an upcoming date without calling it tonight', () => {
    const line = eventWhenLine('2026-09-01T20:00:00Z', AFTER_DEMO_NIGHT)
    expect(line).toBe('1 Sept 2026')
    expect(line).not.toMatch(/tonight/i)
  })

  it('prints the pass date as a calendar fact', () => {
    expect(passDateLine(DEMO_EVENT.startsAt)).toBe('13 Aug 2026')
    expect(passDateLine(DEMO_EVENT.startsAt)).not.toMatch(/tonight/i)
  })
})

describe('first-paint copy', () => {
  const app = source('../App.tsx')
  const organizer = source('../components/Organizer.tsx')
  const door = source('../components/Door.tsx')

  it('names tabs as jobs and keeps wallet last in the footer', () => {
    expect(app).toContain('Make tickets')
    expect(app).toContain('Your tickets')
    expect(app).toContain('At the door')
    expect(app).not.toMatch(/\{item\}/)
    expect(app).toContain('Keys stay in the wallet.')
    expect(app).not.toContain('Needs BSV Desktop')
    expect(app).not.toContain("'Ready.'")
    expect(app).not.toContain('identityKey')
  })

  it('does not leak wallet copy or Mint on organizer first paint', () => {
    expect(EVENT_NAME).toBe('Demo Night')
    expect(EVENT_PLACE).toBe('The Overlay')
    expect(organizer).toContain('EVENT_NAME')
    expect(organizer).toContain('EVENT_PLACE')
    expect(organizer).not.toContain('Approve in your wallet')
    expect(organizer).not.toContain('We’ll ask you to approve this in a moment.')
    expect(organizer).not.toMatch(/>Mint</)
    expect(organizer).not.toContain('identityKey')
  })

  it('keeps the door first paint free of protocol dump', () => {
    expect(door).toContain('Paste or scan the ticket.')
    expect(door).toContain('Check ticket')
    expect(door).toContain('Not a ticket.')
    expect(door).not.toContain('Lookup overlay')
    expect(door).not.toContain('ls_anytx')
    expect(door).not.toContain('overlayLookupService')
    expect(door).not.toContain('txid.vout')
    expect(door).not.toContain('UTXO')
    expect(door).not.toContain('QR must be ticket JSON')
  })
})
