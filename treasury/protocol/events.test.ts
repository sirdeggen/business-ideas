import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import {
  EVENT_TAG,
  encodeEventFields,
  fundGate,
  inviteHeadline,
  parseEventFields,
  proposeGate,
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

  it('counts two roles of the same identity as two approvals', () => {
    const one = key()
    const derivedTreasurer = key()
    const derivedChair = key()
    const derivedBookkeeper = key()
    const payee = key()
    const events: BoardEvent[] = [
      event({
        treasuryId: 'solo',
        kind: 'created',
        at: '2026-08-01T10:00:00.000Z',
        payload: {
          name: 'Solo Board',
          signerCount: 3,
          signers: [
            { role: 'treasurer', identityKey: one },
            { role: 'chair', identityKey: one },
            { role: 'bookkeeper', identityKey: one }
          ]
        }
      }),
      event({
        treasuryId: 'solo',
        kind: 'joined',
        at: '2026-08-01T10:01:00.000Z',
        payload: { role: 'treasurer', identityKey: one, derivedPubkey: derivedTreasurer }
      }),
      event({
        treasuryId: 'solo',
        kind: 'joined',
        at: '2026-08-01T10:02:00.000Z',
        payload: { role: 'chair', identityKey: one, derivedPubkey: derivedChair }
      }),
      event({
        treasuryId: 'solo',
        kind: 'joined',
        at: '2026-08-01T10:03:00.000Z',
        payload: { role: 'bookkeeper', identityKey: one, derivedPubkey: derivedBookkeeper }
      }),
      event({
        treasuryId: 'solo',
        kind: 'proposed',
        at: '2026-08-01T10:05:00.000Z',
        payload: {
          proposalId: 'p-solo',
          amountSats: 12_000,
          payeeIdentityKey: payee,
          memo: 'hall hire',
          payeeLockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac',
          vaultTxid: 'ab'.repeat(32),
          vaultVout: 0,
          vaultSatoshis: 50_000,
          feeSats: 100,
          changeSats: 37_900,
          identityKey: one,
          derivedPubkey: derivedTreasurer,
          role: 'treasurer',
          signature: [4, 5, 6]
        }
      })
    ]

    const afterPropose = reconstructTreasury(events)
    assert.ok(afterPropose)
    assert.equal(afterPropose.proposals[0].approvals.length, 1)
    assert.equal(afterPropose.proposals[0].approvals[0].role, 'treasurer')
    assert.equal(afterPropose.proposals[0].status, 'open')

    events.push(event({
      treasuryId: 'solo',
      kind: 'approved',
      at: '2026-08-01T10:06:00.000Z',
      payload: {
        proposalId: 'p-solo',
        identityKey: one,
        derivedPubkey: derivedChair,
        role: 'chair',
        signature: [7, 8, 9],
        memo: 'hall hire'
      }
    }))

    const afterSecond = reconstructTreasury(events)
    assert.ok(afterSecond)
    const proposal = afterSecond.proposals[0]
    assert.equal(proposal.approvals.length, 2)
    assert.deepEqual(proposal.approvals.map((row) => row.role), ['treasurer', 'chair'])
    assert.equal(proposal.approvals[0].identityKey, proposal.approvals[1].identityKey)
    assert.equal(proposal.status, 'approved')

    events.push(event({
      treasuryId: 'solo',
      kind: 'approved',
      at: '2026-08-01T10:07:00.000Z',
      payload: {
        proposalId: 'p-solo',
        identityKey: one,
        derivedPubkey: derivedTreasurer,
        role: 'treasurer',
        signature: [4, 5, 6],
        memo: 'hall hire'
      }
    }))
    const afterDup = reconstructTreasury(events)
    assert.ok(afterDup)
    assert.equal(afterDup.proposals[0].approvals.length, 2)
    assert.equal(afterDup.proposals[0].status, 'approved')

    events.push(event({
      treasuryId: 'solo',
      kind: 'approved',
      at: '2026-08-01T10:08:00.000Z',
      payload: {
        proposalId: 'p-solo',
        identityKey: one,
        derivedPubkey: derivedTreasurer,
        role: 'treasurer',
        p2msSignature: [10, 11],
        memo: 'hall hire'
      }
    }))
    events.push(event({
      treasuryId: 'solo',
      kind: 'approved',
      at: '2026-08-01T10:09:00.000Z',
      payload: {
        proposalId: 'p-solo',
        identityKey: one,
        derivedPubkey: derivedChair,
        role: 'chair',
        p2msSignature: [12, 13],
        memo: 'hall hire'
      }
    }))
    const afterVault = reconstructTreasury(events)
    assert.ok(afterVault)
    assert.equal(afterVault.proposals[0].p2msSigs.length, 2)
    assert.deepEqual(afterVault.proposals[0].p2msSigs.map((row) => row.role), ['treasurer', 'chair'])
  })

  it('keeps Fund disabled after create until every seat has joined, and says invite first', () => {
    const treasurer = key()
    const chair = key()
    const bookkeeper = key()
    const derived = [key(), key(), key()]
    const created = reconstructTreasury([
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
        payload: { role: 'treasurer', identityKey: treasurer, derivedPubkey: derived[0] }
      })
    ])
    assert.ok(created)
    assert.equal(created.lockingScriptHex, undefined)
    assert.equal(created.vault.length, 0)
    assert.equal(inviteHeadline(created), 'Invite chair and bookkeeper')
    const blocked = fundGate({ wallet: {}, treasury: created, busy: false })
    assert.equal(blocked.disabled, true)
    assert.match(blocked.reason, /Invite chair and bookkeeper/)
    assert.match(blocked.reason, /every seat has joined/)
    assert.equal(proposeGate({ wallet: {}, treasury: created, busy: false }).reason, 'Fund the vault before proposing a payment.')

    const allJoined = reconstructTreasury([
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
        payload: { role: 'treasurer', identityKey: treasurer, derivedPubkey: derived[0] }
      }),
      event({
        treasuryId: 'fresh',
        kind: 'joined',
        at: '2026-08-14T03:00:02.000Z',
        payload: { role: 'chair', identityKey: chair, derivedPubkey: derived[1] }
      }),
      event({
        treasuryId: 'fresh',
        kind: 'joined',
        at: '2026-08-14T03:00:03.000Z',
        payload: { role: 'bookkeeper', identityKey: bookkeeper, derivedPubkey: derived[2] }
      })
    ])
    assert.ok(allJoined)
    assert.ok(allJoined.lockingScriptHex)
    assert.equal(allJoined.threshold, 2)
    assert.equal(inviteHeadline(allJoined), null)
    const open = fundGate({ wallet: {}, treasury: allJoined, busy: false })
    assert.equal(open.disabled, false)
    assert.equal(open.reason, '')
    assert.equal(allJoined.vault.length, 0)
    assert.equal(proposeGate({ wallet: {}, treasury: allJoined, busy: false }).disabled, true)
  })
})
