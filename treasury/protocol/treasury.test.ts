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
  requiredRoles,
  thresholdMet,
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

  it('builds a 1-of-1 locking script so the creator can fund before others join', () => {
    const pk = PrivateKey.fromRandom().toPublicKey().toString()
    const script = p2msLock([pk], 1)
    const asm = script.toASM()
    assert.match(asm, /^OP_1 /)
    assert.match(asm, / OP_1 OP_CHECKMULTISIG$/)
  })

  it('rejects a vault with no pubkeys or more than three', () => {
    const pk = PrivateKey.fromRandom().toPublicKey().toString()
    assert.throws(() => p2msLock([], 1), /1-of-1, 2-of-2, or 2-of-3/)
    assert.throws(() => p2msLock([pk, pk, pk, pk], 2), /1-of-1, 2-of-2, or 2-of-3/)
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
})
