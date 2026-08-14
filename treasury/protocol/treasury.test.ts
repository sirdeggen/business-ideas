import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LockingScript, OP, PrivateKey, ProtoWallet, Spend } from '@bsv/sdk'
import {
  PROTOCOL_ID,
  assembleP2msUnlockingScript,
  canonicalProposalBytes,
  p2msLock,
  p2msSignData,
  planSpend,
  nextOpenRole,
  requiredRoles,
  thresholdMet,
  uniqueApprovers,
  vaultKeyID,
  verifyWalletDataSignature
} from './treasury.ts'

async function signerWallet(): Promise<{ wallet: ProtoWallet; identity: string; derived: string }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey: identity } = await wallet.getPublicKey({ identityKey: true })
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: 'treasury-test',
    counterparty: 'self'
  })
  return { wallet, identity, derived }
}

describe('policy treasury protocol', () => {
  it('builds a 2-of-3 BRC-47 locking script', async () => {
    const a = await signerWallet()
    const b = await signerWallet()
    const c = await signerWallet()
    const script = p2msLock([a.derived, b.derived, c.derived], 2)
    const asm = script.toASM()
    assert.match(asm, /^OP_2 /)
    assert.match(asm, / OP_3 OP_CHECKMULTISIG$/)
    assert.equal(script.chunks.at(-1)?.op, OP.OP_CHECKMULTISIG)
  })

  it('rejects a 1-of-1 vault', () => {
    const pk = PrivateKey.fromRandom().toPublicKey().toString()
    assert.throws(() => p2msLock([pk], 1), /2-of-2 or 2-of-3/)
  })

  it('canonical proposal is stable and signed with BRC-100 createSignature({ data })', async () => {
    const { wallet, derived } = await signerWallet()
    const bytes = canonicalProposalBytes({
      v: 1,
      treasuryId: 't1',
      proposalId: 'p1',
      amountSats: 12000,
      payeeIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
      memo: 'hall hire',
      payeeLockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac'
    })
    const again = canonicalProposalBytes({
      v: 1,
      treasuryId: 't1',
      proposalId: 'p1',
      amountSats: 12000,
      payeeIdentityKey: bytes.length ? PrivateKey.fromRandom().toPublicKey().toString() : '',
      memo: 'hall hire',
      payeeLockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac'
    })
    // different payee → different bytes
    assert.notEqual(Buffer.from(bytes).toString('hex'), Buffer.from(again).toString('hex'))

    const payee = PrivateKey.fromRandom().toPublicKey().toString()
    const data = canonicalProposalBytes({
      v: 1,
      treasuryId: 't1',
      proposalId: 'p1',
      amountSats: 12000,
      payeeIdentityKey: payee,
      memo: 'hall hire',
      payeeLockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac'
    })
    const { signature } = await wallet.createSignature({
      data,
      protocolID: PROTOCOL_ID,
      keyID: 'treasury-test',
      counterparty: 'self'
    })
    assert.equal(verifyWalletDataSignature(derived, data, signature), true)
    const other = await signerWallet()
    assert.equal(verifyWalletDataSignature(other.derived, data, signature), false)
  })

  it('2-of-3 P2MS spend validates in the script interpreter', async () => {
    const treasurer = await signerWallet()
    const chair = await signerWallet()
    const bookkeeper = await signerWallet()
    const pubkeys = [treasurer.derived, chair.derived, bookkeeper.derived]
    const lockingScript = p2msLock(pubkeys, 2)
    const sourceTXID = 'ab'.repeat(32)
    const plan = {
      sourceTXID,
      sourceOutputIndex: 0,
      sourceSatoshis: 20_000,
      vaultLockingScriptHex: lockingScript.toHex(),
      payeeLockingScriptHex: p2msLock(
        [PrivateKey.fromRandom().toPublicKey().toString(), PrivateKey.fromRandom().toPublicKey().toString()],
        2
      ).toHex(),
      amountSats: 12_000,
      changeSats: 7_900,
      feeSats: 100
    }
    const data = p2msSignData(plan)
    const sigs: Record<string, number[]> = {}
    for (const signer of [treasurer, bookkeeper]) {
      const { signature } = await signer.wallet.createSignature({
        data,
        protocolID: PROTOCOL_ID,
        keyID: 'treasury-test',
        counterparty: 'self'
      })
      sigs[signer.derived] = signature
    }
    const unlockingScript = assembleP2msUnlockingScript({
      pubkeys,
      signaturesByPubkey: sigs,
      threshold: 2
    })

    const spend = new Spend({
      sourceTXID,
      sourceOutputIndex: 0,
      sourceSatoshis: 20_000,
      lockingScript,
      unlockingScript,
      transactionVersion: 1,
      otherInputs: [],
      outputs: [
        { satoshis: 12_000, lockingScript: LockingScript.fromHex(plan.payeeLockingScriptHex) },
        { satoshis: 7_900, lockingScript }
      ],
      inputIndex: 0,
      inputSequence: 0xffffffff,
      lockTime: 0
    })
    assert.equal(spend.validate(), true)
  })

  it('plans change and enforces threshold helpers', () => {
    assert.deepEqual(planSpend({ vaultSatoshis: 5000, amountSats: 1000 }), {
      amountSats: 1000,
      feeSats: 100,
      changeSats: 3900
    })
    assert.throws(() => planSpend({ vaultSatoshis: 50, amountSats: 40 }), /need 140/)
    assert.equal(thresholdMet(2, 2), true)
    assert.equal(thresholdMet(1, 2), false)
    assert.deepEqual(requiredRoles(2), ['treasurer', 'chair'])
    assert.deepEqual(requiredRoles(3), ['treasurer', 'chair', 'bookkeeper'])
  })

  it('counts distinct roles, not distinct identity keys', () => {
    const one = PrivateKey.fromRandom().toPublicKey().toString()
    const rows = [
      { role: 'treasurer' as const, identityKey: one },
      { role: 'chair' as const, identityKey: one },
      { role: 'chair' as const, identityKey: one }
    ]
    const unique = uniqueApprovers(rows)
    assert.equal(unique.length, 2)
    assert.deepEqual(unique.map((row) => row.role), ['treasurer', 'chair'])
    assert.equal(thresholdMet(unique.length, 2), true)
    assert.equal(nextOpenRole(['treasurer', 'chair', 'bookkeeper'], unique), 'bookkeeper')
    assert.equal(nextOpenRole(['treasurer', 'chair'], unique), undefined)
  })

  it('derives extra seats of the same identity with a per-role keyID', () => {
    const one = PrivateKey.fromRandom().toPublicKey().toString()
    const other = PrivateKey.fromRandom().toPublicKey().toString()
    const signers = [
      { role: 'treasurer' as const, identityKey: one, derivedPubkey: 'aa', joinedAt: '2026-08-01T10:01:00.000Z' },
      { role: 'chair' as const, identityKey: one, derivedPubkey: 'bb', joinedAt: '2026-08-01T10:02:00.000Z' },
      { role: 'bookkeeper' as const, identityKey: one }
    ]
    assert.equal(vaultKeyID('t-1', 'treasurer', one, signers), 't-1')
    assert.equal(vaultKeyID('t-1', 'chair', one, signers), 't-1:chair')
    assert.equal(vaultKeyID('t-1', 'bookkeeper', one, signers), 't-1:bookkeeper')
    assert.equal(
      vaultKeyID('t-1', 'chair', other, [
        { role: 'treasurer', identityKey: one, derivedPubkey: 'aa' },
        { role: 'chair', identityKey: other }
      ]),
      't-1'
    )
  })

  it('2-of-3 P2MS spend works when two seats share one wallet via per-role keys', async () => {
    const shared = new ProtoWallet(PrivateKey.fromRandom())
    const bookkeeper = await signerWallet()
    const { publicKey: treasurerKey } = await shared.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: 'treasury-test',
      counterparty: 'self'
    })
    const { publicKey: chairKey } = await shared.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: 'treasury-test:chair',
      counterparty: 'self'
    })
    assert.notEqual(treasurerKey, chairKey)
    const pubkeys = [treasurerKey, chairKey, bookkeeper.derived]
    const lockingScript = p2msLock(pubkeys, 2)
    const sourceTXID = 'ab'.repeat(32)
    const plan = {
      sourceTXID,
      sourceOutputIndex: 0,
      sourceSatoshis: 20_000,
      vaultLockingScriptHex: lockingScript.toHex(),
      payeeLockingScriptHex: p2msLock(
        [PrivateKey.fromRandom().toPublicKey().toString(), PrivateKey.fromRandom().toPublicKey().toString()],
        2
      ).toHex(),
      amountSats: 12_000,
      changeSats: 7_900,
      feeSats: 100
    }
    const data = p2msSignData(plan)
    const sigs: Record<string, number[]> = {}
    const { signature: treasurerSig } = await shared.createSignature({
      data,
      protocolID: PROTOCOL_ID,
      keyID: 'treasury-test',
      counterparty: 'self'
    })
    const { signature: chairSig } = await shared.createSignature({
      data,
      protocolID: PROTOCOL_ID,
      keyID: 'treasury-test:chair',
      counterparty: 'self'
    })
    sigs[treasurerKey] = treasurerSig
    sigs[chairKey] = chairSig
    const unlockingScript = assembleP2msUnlockingScript({
      pubkeys,
      signaturesByPubkey: sigs,
      threshold: 2
    })
    const spend = new Spend({
      sourceTXID,
      sourceOutputIndex: 0,
      sourceSatoshis: 20_000,
      lockingScript,
      unlockingScript,
      transactionVersion: 1,
      otherInputs: [],
      outputs: [
        { satoshis: 12_000, lockingScript: LockingScript.fromHex(plan.payeeLockingScriptHex) },
        { satoshis: 7_900, lockingScript }
      ],
      inputIndex: 0,
      inputSequence: 0xffffffff,
      lockTime: 0
    })
    assert.equal(spend.validate(), true)
  })
})
