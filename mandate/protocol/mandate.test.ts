import { KeyDeriver, LockingScript, MerklePath, PrivateKey, ProtoWallet, PushDrop, Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  CHANGE_WAITING,
  DEFAULT_CAP_SATS,
  DEFAULT_FEE_BPS,
  DEFAULT_GAIN_SATS,
  DEFAULT_NOTICE_DAYS,
  DEFAULT_PERIOD_DAYS,
  LOCK_KEY_ID,
  MAGIC,
  MAX_FEE_BPS,
  MIN_FEE_BPS,
  NOT_WHITELISTED,
  NOTHING_TO_RECALL,
  OP_CHECKSIG,
  OVER_BALANCE,
  OVER_CAP,
  PROTOCOL_ID,
  SAMPLE_DESTINATION,
  SAMPLE_MANAGER,
  SAMPLE_OTHER,
  SIGNING_COUNTERPARTY,
  SIGNING_KEY_ID,
  addDays,
  bookFromRecords,
  deskFromRecords,
  encodeChangeFields,
  encodeFundFields,
  encodeGainFields,
  encodeOpenFields,
  encodeRecallFields,
  encodeSendFields,
  feeSatsOf,
  fundMandate,
  mandateIdFor,
  mandateLock,
  markGain,
  openMandate,
  parseMandateFields,
  pendingChanges,
  positionOf,
  proposeChange,
  recallMandate,
  sendMandate,
  signManagerSends,
  signOwnerRecords,
  type OpenInput,
  type RecordSigner
} from './mandate'

const NOW = '2026-10-13T16:00:00Z'
const LATER = '2026-10-13T18:00:00Z'
const NEXT_PERIOD = addDays(NOW, DEFAULT_PERIOD_DAYS)
const AFTER_NOTICE = addDays(NOW, DEFAULT_NOTICE_DAYS)
const NONCE = 'ab'.repeat(16)

function walletOf(key = PrivateKey.fromRandom()): { wallet: RecordSigner, key: PrivateKey } {
  return { wallet: new ProtoWallet(key), key }
}

async function identityOf(wallet: RecordSigner): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return publicKey
}

function opened(patch: Partial<OpenInput> = {}, ownerKey?: string) {
  return openMandate({
    orgName: 'Harbor HOA Reserve',
    managerKey: SAMPLE_MANAGER,
    whitelist: [SAMPLE_DESTINATION],
    periodCapSats: DEFAULT_CAP_SATS,
    periodDays: DEFAULT_PERIOD_DAYS,
    feeBps: DEFAULT_FEE_BPS,
    noticeDays: DEFAULT_NOTICE_DAYS,
    ownerKey,
    ...patch
  }, NOW, NONCE)
}

describe('mandate protocol', () => {
  it('binds the id to sha256(ownerKey || nonce) and keeps the fee inside 5–10%', () => {
    const desk = opened()
    const mandate = desk.mandate!
    expect(mandate.mandateId).toBe(mandateIdFor(mandate.ownerKey, NONCE))
    expect(mandate.mandateId).toHaveLength(64)
    expect(mandateIdFor(mandate.ownerKey, 'cd'.repeat(16))).not.toBe(mandate.mandateId)
    expect(feeSatsOf(DEFAULT_GAIN_SATS, DEFAULT_FEE_BPS)).toBe(4_000)
    expect(feeSatsOf(10_001, 800)).toBe(800)
    expect(feeSatsOf(1, 500)).toBe(0)
    expect(MIN_FEE_BPS).toBe(500)
    expect(MAX_FEE_BPS).toBe(1_000)
    expect(() => openMandate({ ...opened().mandate!, feeBps: 499, managerKey: SAMPLE_MANAGER, whitelist: [SAMPLE_DESTINATION] }, NOW, NONCE)).toThrow(/5% to 10%/)
    expect(() => feeSatsOf(50_000, 1_001)).not.toThrow()
    expect(() => openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: DEFAULT_CAP_SATS,
      periodDays: DEFAULT_PERIOD_DAYS,
      feeBps: 1_001,
      noticeDays: DEFAULT_NOTICE_DAYS
    }, NOW, NONCE)).toThrow(/5% to 10%/)
  })

  it('refuses a destination off the whitelist, a send over the cap, and a send over the balance', () => {
    let desk = fundMandate(opened(), 1_000_000, NOW)
    desk = sendMandate(desk, SAMPLE_OTHER, 1_000, LATER)
    expect(desk.sends).toHaveLength(0)
    expect(desk.rejection).toBe(NOT_WHITELISTED)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 100_001, LATER)
    expect(desk.rejection).toBe(OVER_CAP)
    expect(desk.sends).toHaveLength(0)
    desk = sendMandate({ ...opened(), funds: [] }, SAMPLE_DESTINATION, 1, LATER)
    expect(desk.rejection).toBe(OVER_BALANCE)
    desk = fundMandate(opened({ periodCapSats: 1_000 }), 50_000, NOW)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 600, LATER)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 500, LATER)
    expect(desk.rejection).toBe(OVER_CAP)
    expect(desk.sends).toHaveLength(1)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 400, LATER)
    expect(desk.sends).toHaveLength(2)
    expect(positionOf(desk, LATER)?.remainingCapSats).toBe(0)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 1_000, NEXT_PERIOD)
    expect(desk.sends).toHaveLength(3)
    expect(positionOf(desk, NEXT_PERIOD)?.remainingCapSats).toBe(0)
    expect(positionOf(desk, NEXT_PERIOD)?.spentThisPeriod).toBe(1_000)
  })

  it('accrues the fee by formula and lets the owner pull the whole balance back', () => {
    let desk = fundMandate(opened(), 1_000_000, NOW)
    desk = markGain(desk, DEFAULT_GAIN_SATS, LATER)
    expect(positionOf(desk, LATER)?.accruedFeeSats).toBe(4_000)
    expect(positionOf(desk, LATER)?.balanceSats).toBe(1_000_000)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 25_000, LATER)
    expect(positionOf(desk, LATER)?.balanceSats).toBe(975_000)
    desk = recallMandate(desk, LATER)
    expect(desk.recalls[0]?.amountSats).toBe(975_000)
    expect(positionOf(desk, LATER)?.balanceSats).toBe(0)
    desk = recallMandate(desk, LATER)
    expect(desk.rejection).toBe(NOTHING_TO_RECALL)
    expect(desk.recalls).toHaveLength(1)
  })

  it('keeps a mandate change waiting until the notice period ends', () => {
    let desk = fundMandate(opened(), 1_000_000, NOW)
    desk = proposeChange(desk, 'cap', '1000', NOW)
    expect(desk.notice).toBe(CHANGE_WAITING)
    expect(desk.changes[0]?.effectiveAt).toBe(AFTER_NOTICE)
    expect(pendingChanges(desk, LATER)).toHaveLength(1)
    expect(positionOf(desk, LATER)?.terms.periodCapSats).toBe(DEFAULT_CAP_SATS)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 5_000, LATER)
    expect(desk.sends).toHaveLength(1)
    const blocked = sendMandate(desk, SAMPLE_DESTINATION, 5_000, AFTER_NOTICE)
    expect(blocked.rejection).toBe(OVER_CAP)
    expect(blocked.sends).toHaveLength(1)
    expect(positionOf(desk, AFTER_NOTICE)?.terms.periodCapSats).toBe(1_000)
    expect(pendingChanges(desk, AFTER_NOTICE)).toHaveLength(0)
    const fresh = proposeChange(fundMandate(opened(), 1_000_000, NOW), 'cap', '1000', NOW)
    const allowed = sendMandate(fresh, SAMPLE_DESTINATION, 1_000, AFTER_NOTICE)
    expect(allowed.sends).toHaveLength(1)
    expect(sendMandate(allowed, SAMPLE_DESTINATION, 1, AFTER_NOTICE).rejection).toBe(OVER_CAP)
  })

  it('uses the fee in force when a gain is marked, after notice', () => {
    let desk = opened()
    desk = markGain(desk, 10_000, LATER)
    desk = proposeChange(desk, 'fee', '1000', NOW)
    desk = markGain(desk, 10_000, AFTER_NOTICE)
    expect(positionOf(desk, AFTER_NOTICE)?.accruedFeeSats).toBe(1_800)
    expect(positionOf(desk, LATER)?.accruedFeeSats).toBe(800)
  })

  it('locks the output to the owner signing key and OP_CHECKSIG, and leaves the other rules out of the script', async () => {
    const owner = PrivateKey.fromRandom()
    const ownerKey = owner.toPublicKey().toString().toLowerCase()
    const lock = mandateLock(ownerKey)
    const child = new KeyDeriver(owner).derivePublicKey(PROTOCOL_ID, LOCK_KEY_ID, 'anyone', true)
    expect(lock).toBe(`21${child.toString().toLowerCase()}ac`)
    expect(lock).not.toBe(`21${ownerKey}ac`)
    expect(lock.endsWith(OP_CHECKSIG.toString(16))).toBe(true)
    expect(lock.startsWith('21')).toBe(true)
    expect(lock).toHaveLength(70)
    expect(opened({ ownerKey }).mandate?.lockHex).toBe(lock)
    const lockingScript = LockingScript.fromHex(lock)
    const fund = new Transaction()
    fund.addOutput({ lockingScript, satoshis: 1_000 })
    const wallet = new ProtoWallet(owner)
    const spend = new Transaction()
    spend.addInput({
      sourceTransaction: fund,
      sourceOutputIndex: 0,
      unlockingScriptTemplate: new PushDrop(wallet).unlock(
        PROTOCOL_ID,
        LOCK_KEY_ID,
        'anyone',
        'all',
        false,
        1_000,
        lockingScript
      )
    })
    spend.addOutput({ lockingScript: LockingScript.fromHex('51'), satoshis: 600 })
    await spend.sign()
    fund.merklePath = new MerklePath(800_000, [[{ offset: 0, hash: fund.id('hex'), txid: true }]])
    const unlocking = spend.inputs[0].unlockingScript?.toHex() ?? ''
    expect(unlocking.length).toBeGreaterThan(16)
    expect(await spend.verify('scripts only')).toBe(true)
  })

  it('round-trips open, fund, gain, send, recall, and change fields', () => {
    let desk = fundMandate(opened(), 1_000_000, NOW)
    desk = markGain(desk, DEFAULT_GAIN_SATS, LATER)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 25_000, LATER)
    desk = proposeChange(desk, 'whitelist', `${SAMPLE_DESTINATION},${SAMPLE_OTHER}`, NOW)
    desk = recallMandate(desk, LATER)
    expect(desk.mandate?.ownerSig).toBe('')
    expect(desk.sends[0]?.managerSig).toBe('')
    expect(parseMandateFields(encodeOpenFields(desk.mandate!))).toEqual(desk.mandate)
    expect(parseMandateFields(encodeFundFields(desk.funds[0]))).toEqual(desk.funds[0])
    expect(parseMandateFields(encodeGainFields(desk.gains[0]))).toEqual(desk.gains[0])
    expect(parseMandateFields(encodeSendFields(desk.sends[0]))).toEqual(desk.sends[0])
    expect(parseMandateFields(encodeChangeFields(desk.changes[0]))).toEqual(desk.changes[0])
    expect(parseMandateFields(encodeRecallFields(desk.recalls[0]))).toEqual(desk.recalls[0])
  })

  it('verifies BRC-100 createSignature with counterparty anyone, and drops a bad id or a bad send', async () => {
    const owner = walletOf()
    const manager = walletOf()
    const ownerKey = await identityOf(owner.wallet)
    const managerKey = await identityOf(manager.wallet)
    let desk = openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: DEFAULT_CAP_SATS,
      periodDays: DEFAULT_PERIOD_DAYS,
      feeBps: DEFAULT_FEE_BPS,
      noticeDays: DEFAULT_NOTICE_DAYS,
      ownerKey
    }, NOW, NONCE)
    desk = fundMandate(desk, 1_000_000, NOW)
    desk = markGain(desk, DEFAULT_GAIN_SATS, LATER)
    desk = sendMandate(desk, SAMPLE_DESTINATION, 25_000, LATER)
    desk = proposeChange(desk, 'cap', '50000', NOW)
    desk = await signOwnerRecords(owner.wallet, desk)
    expect(desk.mandate?.ownerSig.length).toBeGreaterThan(16)
    expect(desk.sends[0]?.managerSig).toBe('')
    expect(deskFromRecords([
      desk.mandate!,
      desk.funds[0],
      desk.gains[0],
      desk.sends[0],
      desk.changes[0]
    ], desk.mandate!.mandateId)?.sends).toHaveLength(0)
    desk = await signManagerSends(manager.wallet, desk)
    expect(PROTOCOL_ID).toEqual([0, 'mandate'])
    expect(SIGNING_COUNTERPARTY).toBe('anyone')
    expect(SIGNING_KEY_ID).toBe('mandate')
    const records = [desk.mandate!, desk.funds[0], desk.gains[0], desk.sends[0], desk.changes[0]]
    const restored = deskFromRecords(records, desk.mandate!.mandateId)
    expect(restored?.sends).toHaveLength(1)
    expect(restored?.funds[0]?.amountSats).toBe(1_000_000)
    expect(positionOf(restored!, LATER)?.accruedFeeSats).toBe(4_000)
    expect(restored?.changes[0]?.nextValue).toBe('50000')
    const tampered = { ...desk.sends[0], amountSats: 1 }
    expect(deskFromRecords([desk.mandate!, tampered], desk.mandate!.mandateId)?.sends).toHaveLength(0)
    const wrongId = { ...desk.mandate!, mandateId: 'ff'.repeat(32), ownerSig: desk.mandate!.ownerSig }
    expect(deskFromRecords([wrongId])).toBeNull()
    expect(bookFromRecords([
      { ...desk.mandate!, magic: 'treasury' } as typeof desk.mandate,
      desk.mandate!
    ]).map((row) => row.mandate.orgName)).toEqual(['Harbor HOA Reserve'])
    expect(MAGIC).toBe('mandate')
  })

  it('rejects a backdated proposal that would skip the notice period', async () => {
    const owner = walletOf()
    const ownerKey = await identityOf(owner.wallet)
    const txTime = '2026-10-20T12:00:00Z'
    const proposedAt = '2026-09-01T12:00:00Z'
    const input = {
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: DEFAULT_CAP_SATS,
      periodDays: DEFAULT_PERIOD_DAYS,
      feeBps: DEFAULT_FEE_BPS,
      noticeDays: DEFAULT_NOTICE_DAYS,
      ownerKey
    }
    let desk = fundMandate(openMandate(input, txTime, NONCE), 1_000_000, txTime)
    desk = proposeChange(desk, 'cap', '1000', proposedAt)
    expect(desk.changes[0]?.effectiveAt).toBe(addDays(proposedAt, DEFAULT_NOTICE_DAYS))
    expect(desk.changes[0]?.effectiveAt < txTime).toBe(true)
    desk = await signOwnerRecords(owner.wallet, desk)
    const restored = deskFromRecords([
      { ...desk.mandate!, txTime },
      { ...desk.funds[0], txTime },
      { ...desk.changes[0], txTime }
    ], desk.mandate!.mandateId)
    expect(restored?.changes).toHaveLength(0)
    expect(positionOf(restored!, txTime)?.terms.periodCapSats).toBe(DEFAULT_CAP_SATS)

    let honest = fundMandate(openMandate(input, txTime, NONCE), 1_000_000, txTime)
    honest = proposeChange(honest, 'cap', '1000', txTime)
    honest = await signOwnerRecords(owner.wallet, honest)
    const kept = deskFromRecords([
      { ...honest.mandate!, txTime },
      { ...honest.funds[0], txTime },
      { ...honest.changes[0], txTime }
    ], honest.mandate!.mandateId)
    expect(kept?.changes).toHaveLength(1)
    expect(positionOf(kept!, txTime)?.terms.periodCapSats).toBe(DEFAULT_CAP_SATS)
    expect(positionOf(kept!, addDays(txTime, DEFAULT_NOTICE_DAYS))?.terms.periodCapSats).toBe(1_000)
  })

  it('rejects a backdated send from a manager who was already replaced', async () => {
    const owner = walletOf()
    const oldManager = walletOf()
    const nextManager = walletOf()
    const ownerKey = await identityOf(owner.wallet)
    const oldKey = await identityOf(oldManager.wallet)
    const nextKey = await identityOf(nextManager.wallet)
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
    }, openedAt, NONCE)
    desk = fundMandate(desk, 1_000_000, openedAt)
    desk = proposeChange(desk, 'manager', nextKey, replacedAt)
    desk = await signOwnerRecords(owner.wallet, desk)
    const local = await signManagerSends(oldManager.wallet, sendMandate(desk, SAMPLE_DESTINATION, 25_000, during))
    expect(local.sends[0]?.managerSig.length).toBeGreaterThan(16)
    expect(positionOf(local, during)?.terms.managerKey).toBe(oldKey)

    const backdated = deskFromRecords([
      { ...desk.mandate!, txTime: openedAt },
      { ...desk.funds[0], txTime: openedAt },
      { ...desk.changes[0], txTime: replacedAt },
      { ...local.sends[0], txTime: after }
    ], desk.mandate!.mandateId)
    expect(backdated?.changes).toHaveLength(1)
    expect(positionOf(backdated!, after)?.terms.managerKey).toBe(nextKey)
    expect(backdated?.sends).toHaveLength(0)
    expect(positionOf(backdated!, after)?.balanceSats).toBe(1_000_000)
    expect(positionOf(backdated!, during)?.spentThisPeriod).toBe(0)

    const honest = deskFromRecords([
      { ...desk.mandate!, txTime: openedAt },
      { ...desk.funds[0], txTime: openedAt },
      { ...desk.changes[0], txTime: replacedAt },
      { ...local.sends[0], txTime: during }
    ], desk.mandate!.mandateId)
    expect(honest?.sends).toHaveLength(1)
    expect(positionOf(honest!, during)?.balanceSats).toBe(975_000)
    expect(positionOf(honest!, during)?.terms.managerKey).toBe(oldKey)
  })
})
