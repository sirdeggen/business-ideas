import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')

describe('first-paint copy', () => {
  it('names the prize and empty states, not overlay jargon', () => {
    expect(app).toContain('Start a raffle')
    expect(app).toContain('No raffle in this link.')
    expect(app).toContain('What’s it for?')
    expect(app).toContain('Claim')
    expect(app).toContain('Pass')
    expect(app).toContain('Draw')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('stays a company-offsite raffle, not a casino or sweepstakes', () => {
    expect(app).toContain('Friday offsite')
    expect(app).toContain('Anyone at the offsite')
    expect(app).not.toMatch(/jackpot/i)
    expect(app).not.toMatch(/sweepstake/i)
    expect(app).not.toMatch(/casino/i)
    expect(app).not.toMatch(/\$400/)
    expect(app).not.toMatch(/\bpot\b/i)
    expect(app).not.toMatch(/tombola/i)
  })
})
