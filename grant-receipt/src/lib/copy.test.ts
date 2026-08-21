import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clerkReceiptId, formatWhen, formatWhenShort } from './copy.ts'

describe('keepable clerk copy', () => {
  const purposeHash = '2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc'

  it('prints a short clerk id, not a 64-char hash headline', () => {
    assert.equal(clerkReceiptId(purposeHash), 'GR-2B4A-D31A')
    assert.equal(clerkReceiptId(purposeHash).includes(purposeHash), false)
    assert.ok(clerkReceiptId(purposeHash).length < 16)
    assert.equal(clerkReceiptId('a1b2c3d4-e5f6-7890-abcd-ef0123456789'), 'GR-A1B2-C3D4')
    assert.equal(clerkReceiptId('short'), 'GR-0000-0000')
  })

  it('formats issued-when without inventing a date', () => {
    assert.equal(formatWhen(''), '')
    assert.equal(formatWhen(), '')
    assert.equal(formatWhen('not-a-date'), 'not-a-date')
    const issued = formatWhen('2026-08-21T16:02:00.000Z')
    assert.match(issued, /Aug/)
    assert.match(issued, /21/)
    assert.match(issued, /2026/)
    const short = formatWhenShort('2026-08-21T16:02:00.000Z')
    assert.match(short, /Aug/)
    assert.match(short, /21/)
  })
})
