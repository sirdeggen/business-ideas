import { MerklePath, PrivateKey, ProtoWallet, PushDrop, Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAP_SATS,
  DEFAULT_FEE_BPS,
  DEFAULT_NOTICE_DAYS,
  DEFAULT_PERIOD_DAYS,
  MAGIC,
  PROTOCOL_ID,
  SAMPLE_DESTINATION,
  SIGNING_KEY_ID,
  encodeChangeFields,
  encodeFundFields,
  encodeOpenFields,
  encodeSendFields,
  fundMandate,
  lockTimeFromIso,
  openMandate,
  positionOf,
  proposeChange,
  sendMandate,
  signManagerSends,
  signOwnerRecords,
  txTimeFromLockTime
} from '../../../protocol/mandate'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import {
  blockHeaderForRoot,
  bookFromItems,
  chainTimeFromOutput,
  headerTimeFromTx,
  itemsFromLookupOutput,
  overlayLookupService,
  overlayTopic,
  viewFromItems,
  type OverlayItem
} from './overlay'

const NONCE = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5189')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5189')).not.toBe('tm_mandate')
    expect(overlayLookupService('http://localhost:5189')).not.toBe('ls_mandate')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only mandate opens on the public book', async () => {
    const owner = new ProtoWallet(PrivateKey.fromRandom())
    const other = new ProtoWallet(PrivateKey.fromRandom())
    const desk = await signOwnerRecords(owner, openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: (await other.getPublicKey({ identityKey: true })).publicKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    }, '2026-10-20T16:00:00Z', NONCE))
    const second = await signOwnerRecords(other, openMandate({
      orgName: 'North Club Treasury',
      managerKey: (await owner.getPublicKey({ identityKey: true })).publicKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: 10_000,
      periodDays: 30,
      feeBps: 500,
      noticeDays: 7
    }, '2026-10-20T16:05:00Z', 'cd'.repeat(16)))
    const foreign = {
      payload: { ...desk.mandate!, magic: 'treasury' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.mandate!, txid: 'aa'.repeat(32), outputIndex: 0, txTime: '2026-10-20T16:00:00Z' },
      foreign,
      { payload: second.mandate!, txid: 'bb'.repeat(32), outputIndex: 0, txTime: '2026-10-20T16:05:00Z' }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    const book = bookFromItems(items)
    expect(book.map((row) => row.mandate.orgName).sort()).toEqual(['Harbor HOA Reserve', 'North Club Treasury'])
    expect(viewFromItems(items, desk.mandate!.mandateId)?.mandate?.orgName).toBe('Harbor HOA Reserve')
    expect(viewFromItems(items, desk.mandate!.mandateId)?.mandate?.txTime).toBe('2026-10-20T16:00:00Z')
    expect(viewFromItems([foreign], desk.mandate!.mandateId)).toBeNull()
    const early = viewFromItems([
      { payload: desk.mandate!, txid: 'aa'.repeat(32), outputIndex: 0, txTime: '2026-10-21T00:00:00Z' }
    ], desk.mandate!.mandateId)
    expect(early).toBeNull()
  })
})

describe('overlay clock', () => {
  it('prefers block time, then broadcast time, then context', () => {
    expect(chainTimeFromOutput({ broadcastTime: '2026-10-20T12:00:00.000Z' })).toBe('2026-10-20T12:00:00Z')
    expect(chainTimeFromOutput({ blockTime: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' })).toBe('2026-02-01T00:00:00Z')
    const context = Array.from(new TextEncoder().encode(JSON.stringify({ admittedAt: '2026-03-01T00:00:00Z' })))
    expect(chainTimeFromOutput({ context })).toBe('2026-03-01T00:00:00Z')
  })

  it('uses a block header bound to the merkle proof and never nLockTime', async () => {
    const owner = new ProtoWallet(PrivateKey.fromRandom())
    const manager = new ProtoWallet(PrivateKey.fromRandom())
    const ownerKey = (await owner.getPublicKey({ identityKey: true })).publicKey
    const managerKey = (await manager.getPublicKey({ identityKey: true })).publicKey
    const openedAt = '2026-10-20T12:00:00Z'
    const proposedAt = '2026-09-01T12:00:00Z'
    let desk = fundMandate(openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: DEFAULT_CAP_SATS,
      periodDays: DEFAULT_PERIOD_DAYS,
      feeBps: DEFAULT_FEE_BPS,
      noticeDays: DEFAULT_NOTICE_DAYS,
      ownerKey
    }, openedAt, NONCE), 1_000_000, openedAt)
    desk = proposeChange(desk, 'cap', '1000', proposedAt)
    desk = await signOwnerRecords(owner, desk)
    const lockTime = lockTimeFromIso(proposedAt)
    expect(txTimeFromLockTime(lockTime)).toBe(proposedAt)

    const lockedOnly = await publishFields(encodeChangeFields(desk.changes[0]), lockTime)
    expect(lockedOnly.items[0]?.txTime).toBeUndefined()
    expect(lockedOnly.items[0]?.txClock).toBeUndefined()
    const openRow = await publishFields(encodeOpenFields(desk.mandate!), lockTimeFromIso(openedAt))
    const fundRow = await publishFields(encodeFundFields(desk.funds[0]), lockTimeFromIso(openedAt))
    const pending = viewFromItems([
      ...openRow.items,
      ...fundRow.items,
      ...lockedOnly.items
    ], desk.mandate!.mandateId)
    expect(pending?.changes).toHaveLength(1)
    expect(positionOf(pending!, '2027-01-01T00:00:00Z')?.terms.periodCapSats).toBe(DEFAULT_CAP_SATS)

    const headerAt = '2026-10-20T15:00:00Z'
    const headerSeconds = lockTimeFromIso(headerAt)
    const proven = await publishFields(encodeChangeFields(desk.changes[0]), lockTime, headerSeconds)
    expect(proven.items[0]?.txClock).toBe('header')
    expect(proven.items[0]?.txTime).toBe(headerAt)
    expect(proven.items[0]?.txTime).not.toBe(proposedAt)
    const hostAndHeader = itemsFromLookupOutput({
      beef: proven.beef,
      blockTime: '2026-01-01T00:00:00Z',
      blockHeader: proven.blockHeader
    })
    expect(hostAndHeader[0]?.txClock).toBe('header')
    expect(hostAndHeader[0]?.txTime).toBe(headerAt)

    const hostOnly = itemsFromLookupOutput({
      beef: openRow.beef,
      blockTime: '2026-10-21T00:00:00Z'
    })
    expect(hostOnly[0]?.txClock).toBe('host')
    expect(hostOnly[0]?.txTime).toBe('2026-10-21T00:00:00Z')
  })

  it('rejects a lockTime-only send from a replaced manager', async () => {
    const owner = new ProtoWallet(PrivateKey.fromRandom())
    const oldManager = new ProtoWallet(PrivateKey.fromRandom())
    const nextManager = new ProtoWallet(PrivateKey.fromRandom())
    const ownerKey = (await owner.getPublicKey({ identityKey: true })).publicKey
    const oldKey = (await oldManager.getPublicKey({ identityKey: true })).publicKey
    const nextKey = (await nextManager.getPublicKey({ identityKey: true })).publicKey
    const openedAt = '2026-01-01T00:00:00Z'
    const replacedAt = '2026-01-02T00:00:00Z'
    const during = '2026-01-03T00:00:00Z'
    const after = '2026-02-01T00:00:00Z'
    let desk = openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: oldKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: DEFAULT_CAP_SATS,
      periodDays: DEFAULT_PERIOD_DAYS,
      feeBps: DEFAULT_FEE_BPS,
      noticeDays: DEFAULT_NOTICE_DAYS,
      ownerKey
    }, openedAt, 'cd'.repeat(16))
    desk = fundMandate(desk, 1_000_000, openedAt)
    desk = proposeChange(desk, 'manager', nextKey, replacedAt)
    desk = await signOwnerRecords(owner, desk)
    const local = await signManagerSends(oldManager, sendMandate(desk, SAMPLE_DESTINATION, 25_000, during))
    const openItem = await publishFields(encodeOpenFields(desk.mandate!), lockTimeFromIso(openedAt), lockTimeFromIso(openedAt))
    const fundItem = await publishFields(encodeFundFields(desk.funds[0]), lockTimeFromIso(openedAt), lockTimeFromIso(openedAt))
    const changeItem = await publishFields(encodeChangeFields(desk.changes[0]), lockTimeFromIso(replacedAt), lockTimeFromIso(replacedAt))
    const sendItem = await publishFields(encodeSendFields(local.sends[0]), lockTimeFromIso(during))
    expect(openItem.items[0]?.txClock).toBe('header')
    expect(changeItem.items[0]?.txTime).toBe(replacedAt)
    expect(sendItem.items[0]?.txTime).toBeUndefined()
    const restored = viewFromItems([
      ...openItem.items,
      ...fundItem.items,
      ...changeItem.items,
      ...sendItem.items
    ], desk.mandate!.mandateId)
    expect(restored?.sends).toHaveLength(0)
    expect(positionOf(restored!, after)?.terms.managerKey).toBe(nextKey)
    expect(positionOf(restored!, after)?.balanceSats).toBe(1_000_000)
  })
})

async function publishFields(
  fields: number[][],
  lockTime: number,
  headerSeconds?: number
): Promise<{ items: OverlayItem[], beef: number[], blockHeader?: string }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const lockingScript = await new PushDrop(wallet).lock(fields, PROTOCOL_ID, SIGNING_KEY_ID, 'anyone', false, false)
  const tx = new Transaction(1, [], [{ lockingScript, satoshis: 1 }], lockTime)
  let blockHeader: string | undefined
  if (headerSeconds !== undefined) {
    tx.merklePath = new MerklePath(800_000, [[{ offset: 0, hash: tx.id('hex'), txid: true }]])
    blockHeader = blockHeaderForRoot(tx.merklePath.computeRoot(tx.id('hex')), headerSeconds)
    expect(headerTimeFromTx(tx, blockHeader)).toBe(new Date(headerSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  }
  const beef = tx.toAtomicBEEF(true)
  return { items: itemsFromLookupOutput({ beef, blockHeader }), beef, blockHeader }
}
