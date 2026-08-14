import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import {
  EVENT_TAG,
  encodeEventFields,
  fundActionDisabled,
  parseEventFields,
  reconstructTreasury,
  type BoardEvent
} from './events.ts'
import { paymentsCsv, paymentsPdf } from './export.ts'

function key(): string {
  return PrivateKey.fromRandom().toPublicKey().toString()
}

function event(partial: BoardEvent): BoardEvent {
  return partial
}

describe('board event tokens', () => {
  it('round-trips PushDrop fields and ignores other protocols', () => {
    const treasurer = key()
    const fields = encodeEventFields({
      treasuryId: 't-1',
      kind: 'created',
      at: '2026-08-14T00:00:00.000Z',
      payload: { name: 'Demo Club', signerCount: 3, role: 'treasurer', identityKey: treasurer }
    })
    assert.equal(new TextDecoder().decode(Uint8Array.from(fields[0])), EVENT_TAG)
    const parsed = parseEventFields(fields)
    assert.ok(parsed)
    assert.equal(parsed.treasuryId, 't-1')
    assert.equal(parsed.kind, 'created')
    assert.equal(parsed.payload.name, 'Demo Club')
    assert.equal(parsed.at, '2026-08-14T00:00:00.000Z')

    const other = encodeEventFields({
      treasuryId: 't-1',
      kind: 'created',
      at: '2026-08-14T00:00:00.000Z',
      payload: { name: 'Demo Club' }
    })
    other[0] = Array.from(new TextEncoder().encode('not treasury'))
    assert.equal(parseEventFields(other), null)
  })

  it('reconstructs a 2-of-3 treasury from overlay events without a live host', () => {
    const treasurer = key()
    const chair = key()
    const bookkeeper = key()
    const payee = key()
    const derived = [key(), key(), key()]
    const events: BoardEvent[] = [
      event({
        treasuryId: 'club',
        kind: 'created',
        at: '2026-08-01T10:00:00.000Z',
        payload: {
          name: 'Demo Club',
          signerCount: 3,
          signers: [
            { role: 'treasurer', identityKey: treasurer },
            { role: 'chair', identityKey: chair },
            { role: 'bookkeeper', identityKey: bookkeeper }
          ]
        }
      }),
      event({
        treasuryId: 'club',
        kind: 'joined',
        at: '2026-08-01T10:01:00.000Z',
        payload: { role: 'treasurer', identityKey: treasurer, derivedPubkey: derived[0] }
      }),
      event({
        treasuryId: 'club',
        kind: 'joined',
        at: '2026-08-01T10:02:00.000Z',
        payload: { role: 'chair', identityKey: chair, derivedPubkey: derived[1] }
      }),
      event({
        treasuryId: 'club',
        kind: 'joined',
        at: '2026-08-01T10:03:00.000Z',
        payload: { role: 'bookkeeper', identityKey: bookkeeper, derivedPubkey: derived[2] }
      }),
      event({
        treasuryId: 'club',
        kind: 'funded',
        at: '2026-08-01T10:04:00.000Z',
        payload: { txid: 'ab'.repeat(32), vout: 0, satoshis: 50_000, beef: [1, 2, 3] }
      }),
      event({
        treasuryId: 'club',
        kind: 'proposed',
        at: '2026-08-01T10:05:00.000Z',
        payload: {
          proposalId: 'p1',
          amountSats: 12_000,
          payeeIdentityKey: payee,
          memo: 'hall hire',
          payeeLockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac',
          vaultTxid: 'ab'.repeat(32),
          vaultVout: 0,
          vaultSatoshis: 50_000,
          feeSats: 100,
          changeSats: 37_900,
          identityKey: treasurer,
          derivedPubkey: derived[0],
          role: 'treasurer',
          signature: [4, 5, 6]
        }
      }),
      event({
        treasuryId: 'club',
        kind: 'approved',
        at: '2026-08-01T10:06:00.000Z',
        payload: {
          proposalId: 'p1',
          identityKey: chair,
          derivedPubkey: derived[1],
          role: 'chair',
          signature: [7, 8, 9],
          memo: 'hall hire'
        }
      }),
      event({
        treasuryId: 'club',
        kind: 'approved',
        at: '2026-08-01T10:07:00.000Z',
        payload: {
          proposalId: 'p1',
          identityKey: treasurer,
          derivedPubkey: derived[0],
          role: 'treasurer',
          p2msSignature: [10, 11],
          memo: 'hall hire'
        }
      }),
      event({
        treasuryId: 'club',
        kind: 'approved',
        at: '2026-08-01T10:08:00.000Z',
        payload: {
          proposalId: 'p1',
          identityKey: chair,
          derivedPubkey: derived[1],
          role: 'chair',
          p2msSignature: [12, 13],
          memo: 'hall hire'
        }
      }),
      event({
        treasuryId: 'club',
        kind: 'paid',
        at: '2026-08-01T10:09:00.000Z',
        payload: {
          proposalId: 'p1',
          txid: 'cd'.repeat(32),
          amountSats: 12_000,
          memo: 'hall hire',
          changeVout: 1,
          changeSatoshis: 37_900,
          beef: [9, 9, 9]
        }
      })
    ]

    const treasury = reconstructTreasury(events)
    assert.ok(treasury)
    assert.equal(treasury.name, 'Demo Club')
    assert.equal(treasury.threshold, 2)
    assert.equal(treasury.signers.length, 3)
    assert.ok(treasury.lockingScriptHex)
    assert.equal(treasury.proposals[0].status, 'paid')
    assert.equal(treasury.proposals[0].approvals.length, 2)
    assert.equal(treasury.proposals[0].p2msSigs.length, 2)
    assert.equal(treasury.vault[0]?.satoshis, 37_900)
    assert.ok(treasury.feed.some((item) => item.text.includes('approved')))
    assert.ok(treasury.feed.some((item) => item.text.includes('hall hire')))

    const csv = paymentsCsv(treasury, '2026-08')
    assert.match(csv, /hall hire/)
    assert.match(csv, /12000/)
    const pdf = paymentsPdf(treasury, '2026-08')
    assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), '%PDF-')
    assert.match(new TextDecoder('latin1').decode(pdf), /Demo Club/)
  })

  it('reconstructs a lock after create + treasurer join so Fund works on an empty vault', () => {
    const treasurer = key()
    const derived = key()
    const treasury = reconstructTreasury([
      event({
        treasuryId: 'fresh',
        kind: 'created',
        at: '2026-08-14T03:00:00.000Z',
        payload: {
          name: 'Demo Club',
          signerCount: 3,
          signers: [
            { role: 'treasurer', identityKey: treasurer },
            { role: 'chair' },
            { role: 'bookkeeper' }
          ]
        }
      }),
      event({
        treasuryId: 'fresh',
        kind: 'joined',
        at: '2026-08-14T03:00:01.000Z',
        payload: { role: 'treasurer', identityKey: treasurer, derivedPubkey: derived }
      })
    ])
    assert.ok(treasury)
    assert.ok(treasury.lockingScriptHex)
    assert.equal(treasury.threshold, 1)
    assert.equal(treasury.vault.length, 0)
    assert.equal(treasury.signers.filter((signer) => signer.derivedPubkey).length, 1)
    assert.equal(fundActionDisabled({ wallet: {}, treasury, busy: false }), false)
    assert.equal(fundActionDisabled({ wallet: {}, treasury: { ...treasury, vault: [] }, busy: false }), false)
    assert.equal(fundActionDisabled({ wallet: null, treasury, busy: false }), true)
    assert.equal(fundActionDisabled({ wallet: {}, treasury: null, busy: false }), true)
    assert.equal(fundActionDisabled({ wallet: {}, treasury, busy: true }), true)
  })
})
