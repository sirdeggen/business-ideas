import { describe, expect, it } from 'vitest'
import { keepLastGoodBooks, mergeBooks } from './persist'
import { MAGIC, type JoinedSession } from './protocol'

function book(sessionId: string, status: JoinedSession['status'] = 'closed'): JoinedSession {
  return {
    magic: MAGIC,
    version: '1',
    kind: 'session',
    sessionId,
    payerIdentity: '02' + 'ab'.repeat(32),
    payeeIdentity: '03' + 'cd'.repeat(32),
    payerName: 'Alex',
    payeeName: 'Northstar',
    label: 'March crawls',
    dueDate: '2026-09-01',
    createdAt: '2026-08-25T00:00:00.000Z',
    lineItems: [],
    totalSats: 1,
    status,
    txid: 'aa'.repeat(32),
    outputIndex: 0
  }
}

describe('last-good book cache', () => {
  it('keeps the last-good book when overlay returns empty', () => {
    const cached = [book('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'approved')]
    expect(keepLastGoodBooks(cached, [], true)).toEqual(cached)
  })

  it('merges a live book onto last-good instead of replacing the desk', () => {
    const cached = [book('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'closed')]
    const live = [book('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'closed')]
    const merged = keepLastGoodBooks(cached, live, false)
    expect(merged).toHaveLength(2)
    expect(mergeBooks(cached, [book('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'paid')])[0].status).toBe('paid')
  })
})
