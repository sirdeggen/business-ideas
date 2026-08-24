import { describe, expect, it } from 'vitest'
import {
  assertHostCanDraw,
  pickLiveWinner,
  transferSpendInput
} from './actions'
import type { OverlayDraw, OverlayTicket } from './overlay'

const HOST = `02${'ab'.repeat(32)}`
const GUEST = `03${'cd'.repeat(32)}`

function ticket(partial: Partial<OverlayTicket> = {}): OverlayTicket {
  return {
    magic: 'raffle',
    version: '1',
    kind: 'ticket',
    raffleId: 'a'.repeat(32),
    ticketIndex: 1,
    holder: GUEST,
    timestamp: '2026-08-24T12:01:00Z',
    txid: 'ab'.repeat(32),
    outputIndex: 0,
    ...partial
  }
}

describe('draw host check', () => {
  it('rejects a visitor who is not the host', () => {
    expect(() => assertHostCanDraw(HOST, GUEST)).toThrow('Only the host can draw this raffle.')
    expect(() => assertHostCanDraw(HOST, '')).toThrow('Only the host can draw this raffle.')
  })

  it('allows the host identity', () => {
    expect(() => assertHostCanDraw(HOST, HOST)).not.toThrow()
  })

  it('picks one live ticket and ignores an already drawn outpoint', () => {
    const tickets = [
      ticket({ ticketIndex: 1, txid: 'ab'.repeat(32), outputIndex: 0 }),
      ticket({ ticketIndex: 2, txid: 'cd'.repeat(32), outputIndex: 1, holder: HOST })
    ]
    const draws: OverlayDraw[] = [{
      magic: 'raffle',
      version: '1',
      kind: 'draw',
      raffleId: 'a'.repeat(32),
      winningOutpoint: `${'ab'.repeat(32)}.0`,
      winningIndex: 1,
      timestamp: '2026-08-24T12:05:00Z',
      txid: 'ef'.repeat(32),
      outputIndex: 0
    }]
    const winner = pickLiveWinner(tickets, draws)
    expect(winner.ticketIndex).toBe(2)
    expect(winner.txid).toBe('cd'.repeat(32))
  })
})

describe('transfer spend', () => {
  it('spends the held ticket UTXO', () => {
    const input = transferSpendInput({ outpoint: `${'ab'.repeat(32)}.3` })
    expect(input.outpoint).toBe(`${'ab'.repeat(32)}.3`)
    expect(input.unlockingScriptLength).toBe(73)
    expect(input.inputDescription).toMatch(/ticket/i)
  })
})
