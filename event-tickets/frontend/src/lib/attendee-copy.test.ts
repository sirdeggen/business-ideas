import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const attendee = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/Attendee.tsx'),
  'utf8'
)

describe('Attendee stranger copy', () => {
  it('keeps the empty-state sentence and never restores JSON accept compose', () => {
    expect(attendee).toContain('No ticket yet — get one from the organizer.')
    expect(attendee).not.toMatch(/Accept a transfer/i)
    expect(attendee).not.toMatch(/paste the JSON package/i)
    expect(attendee).not.toContain('internalizeAction')
    expect(attendee).not.toMatch(/eventtickets basket/i)
  })
})
