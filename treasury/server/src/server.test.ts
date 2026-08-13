import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { Server } from 'node:http'
import { PrivateKey, ProtoWallet, PushDrop } from '@bsv/sdk'
import { PROTOCOL_ID, canonicalProposalBytes, p2msSignData } from '../../protocol/treasury.ts'
import { createApp } from './server.ts'
import { JsonStore } from './store.ts'

async function wallet(): Promise<{ proto: ProtoWallet; identity: string; derived: string; keyId: string }> {
  const proto = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey: identity } = await proto.getPublicKey({ identityKey: true })
  return { proto, identity, derived: '', keyId: '' }
}

async function jsonStatus<T>(response: Response, expected: number): Promise<T> {
  const raw = await response.text()
  assert.equal(response.status, expected, raw)
  return JSON.parse(raw) as T
}

async function derivedFor(proto: ProtoWallet, treasuryId: string): Promise<string> {
  const { publicKey } = await proto.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: treasuryId,
    counterparty: 'self'
  })
  return publicKey
}

describe('treasury feed server', () => {
  let dir: string
  let server: Server
  let base: string

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'treasury-'))
    const app = createApp(new JsonStore(path.join(dir, 'treasury.json')))
    server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started))
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    base = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await rm(dir, { recursive: true, force: true })
  })

  it('runs the 2-of-3 propose / approve / export flow without custodying keys', async () => {
    const treasurer = await wallet()
    const chair = await wallet()
    const bookkeeper = await wallet()
    const payee = PrivateKey.fromRandom().toPublicKey().toString()

    const created = await fetch(`${base}/treasuries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo Club',
        signerCount: 3,
        signers: [
          { role: 'treasurer', identityKey: treasurer.identity },
          { role: 'chair', identityKey: chair.identity },
          { role: 'bookkeeper', identityKey: bookkeeper.identity }
        ]
      })
    })
    assert.equal(created.status, 201)
    const treasury = await created.json() as { id: string }
    const id = treasury.id

    for (const [role, person] of [
      ['treasurer', treasurer],
      ['chair', chair],
      ['bookkeeper', bookkeeper]
    ] as const) {
      const derived = await derivedFor(person.proto, id)
      const joined = await fetch(`${base}/treasuries/${id}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          identityKey: person.identity,
          derivedPubkey: derived
        })
      })
      assert.equal(joined.status, 200, await joined.text())
    }

    const live = await fetch(`${base}/treasuries/${id}`).then((res) => res.json()) as {
      lockingScriptHex: string
      threshold: number
      signers: Array<{ derivedPubkey: string }>
    }
    assert.equal(live.threshold, 2)
    assert.ok(live.lockingScriptHex)
    assert.equal(live.signers.length, 3)

    const fund = await fetch(`${base}/treasuries/${id}/fund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        txid: 'ab'.repeat(32),
        vout: 0,
        satoshis: 50_000,
        beef: [1, 2, 3, 4]
      })
    })
    assert.equal(fund.status, 200, await fund.text())

    const proposalId = '11111111-1111-1111-1111-111111111111'
    const payeeLockingScriptHex = await new PushDrop(treasurer.proto).lock(
      [Array.from(new TextEncoder().encode('hall hire'))],
      PROTOCOL_ID,
      proposalId,
      payee,
      false,
      false
    ).then((script) => script.toHex())

    const proposalBytes = canonicalProposalBytes({
      v: 1,
      treasuryId: id,
      proposalId,
      amountSats: 12_000,
      payeeIdentityKey: payee,
      memo: 'hall hire',
      payeeLockingScriptHex
    })
    const treasurerDerived = await derivedFor(treasurer.proto, id)
    const { signature: proposeSig } = await treasurer.proto.createSignature({
      data: proposalBytes,
      protocolID: PROTOCOL_ID,
      keyID: id,
      counterparty: 'self'
    })

    const proposed = await fetch(`${base}/treasuries/${id}/proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposalId,
        identityKey: treasurer.identity,
        derivedPubkey: treasurerDerived,
        amountSats: 12_000,
        payeeIdentityKey: payee,
        memo: 'hall hire',
        payeeLockingScriptHex,
        signature: proposeSig
      })
    })
    assert.equal(proposed.status, 201, await proposed.text())

    const chairDerived = await derivedFor(chair.proto, id)
    const { signature: approveSig } = await chair.proto.createSignature({
      data: proposalBytes,
      protocolID: PROTOCOL_ID,
      keyID: id,
      counterparty: 'self'
    })
    const approved = await fetch(`${base}/treasuries/${id}/proposals/${proposalId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityKey: chair.identity,
        derivedPubkey: chairDerived,
        signature: approveSig
      })
    })
    const afterApprove = await jsonStatus<{
      proposals: Array<{ status: string; approvals: unknown[] }>
      feed: Array<{ kind: string; text: string }>
    }>(approved, 200)
    assert.equal(afterApprove.proposals[0].status, 'approved')
    assert.equal(afterApprove.proposals[0].approvals.length, 2)
    assert.ok(afterApprove.feed.some((event) => event.text.includes('Threshold met')))

    const signData = p2msSignData({
      sourceTXID: 'ab'.repeat(32),
      sourceOutputIndex: 0,
      sourceSatoshis: 50_000,
      vaultLockingScriptHex: live.lockingScriptHex,
      payeeLockingScriptHex,
      amountSats: 12_000,
      changeSats: 37_900,
      feeSats: 100
    })
    for (const person of [treasurer, chair]) {
      const derived = await derivedFor(person.proto, id)
      const { signature } = await person.proto.createSignature({
        data: signData,
        protocolID: PROTOCOL_ID,
        keyID: id,
        counterparty: 'self'
      })
      const signed = await fetch(`${base}/treasuries/${id}/proposals/${proposalId}/p2ms-sig`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityKey: person.identity,
          derivedPubkey: derived,
          signature
        })
      })
      assert.equal(signed.status, 200, await signed.text())
    }

    const paid = await fetch(`${base}/treasuries/${id}/proposals/${proposalId}/paid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        txid: 'cd'.repeat(32),
        changeVout: 1,
        beef: [9, 9, 9]
      })
    })
    assert.equal(paid.status, 200, await paid.text())

    const month = new Date().toISOString().slice(0, 7)
    const csv = await fetch(`${base}/treasuries/${id}/export.csv?month=${month}`)
    assert.equal(csv.status, 200)
    const csvText = await csv.text()
    assert.match(csvText, /hall hire/)
    assert.match(csvText, /12000/)

    const pdf = await fetch(`${base}/treasuries/${id}/export.pdf?month=${month}`)
    assert.equal(pdf.status, 200)
    const pdfBytes = Buffer.from(await pdf.arrayBuffer())
    assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-')
    assert.match(pdfBytes.toString('latin1'), /Demo Club/)
  })

  it('does not treat a stranger as a signer', async () => {
    const created = await fetch(`${base}/treasuries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Closed Board', signerCount: 2 })
    })
    const { id } = await created.json() as { id: string }
    const stranger = await wallet()
    const derived = await derivedFor(stranger.proto, id)
    const join = await fetch(`${base}/treasuries/${id}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        role: 'bookkeeper',
        identityKey: stranger.identity,
        derivedPubkey: derived
      })
    })
    assert.equal(join.status, 400)
  })
})
