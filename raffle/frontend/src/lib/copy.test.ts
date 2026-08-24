import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')

describe('first-paint copy', () => {
  it('names the offsite and empty states, not overlay jargon', () => {
    expect(app).toContain('This trip’s draw')
    expect(app).toContain('No raffle in this link.')
    expect(app).toContain('Event name')
    expect(app).toContain('Take a ticket')
    expect(app).toContain('Pass')
    expect(app).toContain('Draw')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('stays a free offsite draw, not a sold raffle or casino', () => {
    expect(app).toContain('Free stub. One winner, in the room.')
    expect(app).toContain('People on this trip')
    expect(app).toContain('One per person')
    expect(app).toContain('Must be here to win')
    expect(app).toContain('Ask ${asked}')
    expect(app).toContain('of ${header.ticketCount} taken')
    expect(app).not.toContain('ticket price')
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
})
