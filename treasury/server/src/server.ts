/** Optional local minutes store. The public UI talks to overlay-us-1 + Message Box. */
import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import {
  PROTOCOL_ID,
  ROLE_LABEL,
  canonicalProposalBytes,
  isIdentityKey,
  p2msLock,
  p2msSignData,
  planSpend,
  requiredRoles,
  shortKey,
  thresholdMet,
  nextOpenRole,
  seatsForIdentity,
  uniqueApprovers,
  verifyWalletDataSignature,
  type Role
} from '../../protocol/treasury.js'
import { paymentsCsv, paymentsPdf } from './export.js'
import { JsonStore, type FeedKind, type Signer, type Treasury } from './store.js'

const IDENTITY = /^(02|03)[0-9a-fA-F]{64}$/

function now(): string {
  return new Date().toISOString()
}

function bad(res: Response, status: number, error: string): void {
  res.status(status).json({ error })
}

function parseRole(value: unknown): Role | null {
  if (value === 'treasurer' || value === 'chair' || value === 'bookkeeper') return value
  return null
}

function findSigner(
  treasury: Treasury,
  identityKey: string,
  derivedPubkey?: string,
  used: Array<{ role: Role }> = []
): Signer | undefined {
  const seats = seatsForIdentity(treasury.signers, identityKey)
  if (derivedPubkey) {
    const match = seats.find((signer) => signer.derivedPubkey === derivedPubkey.toLowerCase())
    if (match) return match
  }
  const next = nextOpenRole(seats.map((signer) => signer.role), used)
  return next ? seats.find((signer) => signer.role === next) : seats[0]
}

function vaultReady(treasury: Treasury): boolean {
  return treasury.signers.every((signer) => Boolean(signer.derivedPubkey)) &&
    treasury.signers.length >= 2
}

function lockingScriptFor(treasury: Treasury): string {
  const pubkeys = treasury.signers.map((signer) => {
    if (!signer.derivedPubkey) throw new Error(`${signer.role} has not joined yet`)
    return signer.derivedPubkey
  })
  return p2msLock(pubkeys, treasury.threshold).toHex()
}

function pushFeed(treasury: Treasury, kind: FeedKind, text: string): void {
  treasury.feed.unshift({ id: randomUUID(), at: now(), kind, text })
}

function yearMonthOrCurrent(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value
  return now().slice(0, 7)
}

function publicTreasury(treasury: Treasury): Omit<Treasury, never> & { protocolID: typeof PROTOCOL_ID } {
  return {
    ...treasury,
    protocolID: PROTOCOL_ID,
    vault: treasury.vault.map((utxo) => ({ ...utxo })),
    lockingScriptHex: treasury.lockingScriptHex
  }
}

export function createApp(store: JsonStore) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '4mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/version', (_req, res) => {
    res.json({
      name: 'policy-treasury-feed',
      protocolID: PROTOCOL_ID,
      note: 'Local board feed stand-in. overlay-express indexes UTXOs and needs MySQL+Mongo; proposals are not UTXOs.'
    })
  })

  app.get('/treasuries', async (_req, res) => {
    const data = await store.read()
    res.json({
      treasuries: data.treasuries.map((treasury) => ({
        id: treasury.id,
        name: treasury.name,
        threshold: treasury.threshold,
        signers: treasury.signers.length,
        joined: treasury.signers.filter((signer) => signer.derivedPubkey).length,
        vaultSats: treasury.vault.reduce((sum, utxo) => sum + utxo.satoshis, 0)
      }))
    })
  })

  app.post('/treasuries', async (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (name.length < 2) {
      bad(res, 400, 'name must be at least 2 characters')
      return
    }
    const signerCount = req.body?.signerCount === 2 ? 2 : 3
    const roles = requiredRoles(signerCount)
    const invited = Array.isArray(req.body?.signers) ? req.body.signers as Array<{ role?: unknown; identityKey?: unknown }> : []
    const signers: Signer[] = roles.map((role) => {
      const match = invited.find((row) => row.role === role)
      const identityKey = typeof match?.identityKey === 'string' ? match.identityKey.trim() : ''
      if (identityKey && !isIdentityKey(identityKey)) {
        throw new Error(`${role} identity key must be 66-hex compressed`)
      }
      return {
        role,
        identityKey: identityKey.toLowerCase()
      }
    })
    try {
      const treasury = await store.update((data) => {
        const created: Treasury = {
          id: randomUUID(),
          name,
          threshold: 2,
          signers,
          vault: [],
          proposals: [],
          feed: [],
          createdAt: now()
        }
        pushFeed(
          created,
          'created',
          `${name} opened as a 2-of-${signerCount} treasury. Invite the other signers to join with BSV Desktop or BSV Browser.`
        )
        data.treasuries.push(created)
        return created
      })
      res.status(201).json(publicTreasury(treasury))
    } catch (error) {
      bad(res, 400, error instanceof Error ? error.message : String(error))
    }
  })

  app.get('/treasuries/:id', async (req, res) => {
    const data = await store.read()
    const treasury = data.treasuries.find((item) => item.id === req.params.id)
    if (!treasury) {
      bad(res, 404, 'treasury not found')
      return
    }
    res.json(publicTreasury(treasury))
  })

  app.get('/treasuries/:id/feed', async (req, res) => {
    const data = await store.read()
    const treasury = data.treasuries.find((item) => item.id === req.params.id)
    if (!treasury) {
      bad(res, 404, 'treasury not found')
      return
    }
    res.json({ feed: treasury.feed })
  })

  app.post('/treasuries/:id/join', async (req, res) => {
    const role = parseRole(req.body?.role)
    const identityKey = typeof req.body?.identityKey === 'string' ? req.body.identityKey.trim() : ''
    const derivedPubkey = typeof req.body?.derivedPubkey === 'string' ? req.body.derivedPubkey.trim() : ''
    if (!role || !IDENTITY.test(identityKey) || !IDENTITY.test(derivedPubkey)) {
      bad(res, 400, 'role, identityKey, and derivedPubkey are required')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        const slot = item.signers.find((signer) => signer.role === role)
        if (!slot) throw new Error(`${role} is not a seat on this treasury`)
        if (slot.identityKey && slot.identityKey !== identityKey.toLowerCase()) {
          throw new Error(`${ROLE_LABEL[role]} seat is reserved for ${shortKey(slot.identityKey, 10)}`)
        }
        if (slot.derivedPubkey && slot.identityKey === identityKey.toLowerCase()) {
          return item
        }
        const taken = item.signers.find(
          (signer) => signer.identityKey === identityKey.toLowerCase() && signer.role !== role
        )
        if (taken) throw new Error('that identity already holds another seat')
        slot.identityKey = identityKey.toLowerCase()
        slot.derivedPubkey = derivedPubkey.toLowerCase()
        slot.joinedAt = now()
        pushFeed(item, 'joined', `${ROLE_LABEL[role]} joined (${shortKey(identityKey, 10)}).`)
        if (vaultReady(item)) {
          item.lockingScriptHex = lockingScriptFor(item)
          pushFeed(
            item,
            'vault_ready',
            `Vault is live: 2-of-${item.signers.length} P2MS. Fund it from any BRC-100 wallet.`
          )
        }
        return item
      })
      res.json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      bad(res, message === 'treasury not found' ? 404 : 400, message)
    }
  })

  app.post('/treasuries/:id/fund', async (req, res) => {
    const txid = typeof req.body?.txid === 'string' ? req.body.txid.trim().toLowerCase() : ''
    const vout = Number(req.body?.vout)
    const satoshis = Number(req.body?.satoshis)
    const beef = req.body?.beef
    if (!/^[0-9a-f]{64}$/.test(txid) || !Number.isInteger(vout) || vout < 0) {
      bad(res, 400, 'txid and vout are required')
      return
    }
    if (!Number.isInteger(satoshis) || satoshis < 1) {
      bad(res, 400, 'satoshis must be a positive integer')
      return
    }
    if (!Array.isArray(beef) || beef.length === 0) {
      bad(res, 400, 'atomic BEEF bytes are required so signers can spend later')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        if (!item.lockingScriptHex) throw new Error('not all signers have joined')
        if (item.vault.some((utxo) => utxo.txid === txid && utxo.vout === vout)) return item
        item.vault.push({ txid, vout, satoshis, beef: beef.map((n: unknown) => Number(n)) })
        pushFeed(item, 'funded', `Treasury received ${satoshis.toLocaleString()} sats (${txid.slice(0, 8)}…).`)
        return item
      })
      res.json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      bad(res, message === 'treasury not found' ? 404 : 400, message)
    }
  })

  app.post('/treasuries/:id/proposals', async (req, res) => {
    const identityKey = typeof req.body?.identityKey === 'string' ? req.body.identityKey.trim() : ''
    const derivedPubkey = typeof req.body?.derivedPubkey === 'string' ? req.body.derivedPubkey.trim() : ''
    const memo = typeof req.body?.memo === 'string' ? req.body.memo.trim() : ''
    const payeeIdentityKey = typeof req.body?.payeeIdentityKey === 'string' ? req.body.payeeIdentityKey.trim() : ''
    const payeeLockingScriptHex = typeof req.body?.payeeLockingScriptHex === 'string'
      ? req.body.payeeLockingScriptHex.trim().toLowerCase()
      : ''
    const amountSats = Number(req.body?.amountSats)
    const proposalId = typeof req.body?.proposalId === 'string' ? req.body.proposalId.trim() : ''
    const signature = Array.isArray(req.body?.signature) ? req.body.signature.map((n: unknown) => Number(n)) : []
    if (!IDENTITY.test(identityKey) || !IDENTITY.test(derivedPubkey) || !IDENTITY.test(payeeIdentityKey)) {
      bad(res, 400, 'proposer, derived pubkey, and payee identity keys are required')
      return
    }
    if (!proposalId || !memo || !payeeLockingScriptHex || signature.length < 8) {
      bad(res, 400, 'proposalId, memo, payee locking script, and proposer signature are required')
      return
    }
    if (!Number.isInteger(amountSats) || amountSats < 1) {
      bad(res, 400, 'amountSats must be a positive integer')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        const signer = findSigner(item, identityKey, derivedPubkey)
        if (!signer?.derivedPubkey) throw new Error('only a joined signer can propose')
        if (signer.derivedPubkey !== derivedPubkey.toLowerCase()) {
          throw new Error('derived pubkey does not match the joined seat')
        }
        const utxo = item.vault[item.vault.length - 1]
        if (!utxo) throw new Error('fund the vault before proposing a payment')
        if (!item.lockingScriptHex) throw new Error('vault locking script is missing')
        const planned = planSpend({ vaultSatoshis: utxo.satoshis, amountSats })
        if (item.proposals.some((row) => row.id === proposalId)) {
          throw new Error('proposalId already used')
        }
        const dataBytes = canonicalProposalBytes({
          v: 1,
          treasuryId: item.id,
          proposalId,
          amountSats,
          payeeIdentityKey,
          memo,
          payeeLockingScriptHex
        })
        if (!verifyWalletDataSignature(derivedPubkey, dataBytes, signature)) {
          throw new Error('proposer signature did not verify')
        }
        const proposal = {
          id: proposalId,
          amountSats,
          payeeIdentityKey: payeeIdentityKey.toLowerCase(),
          memo,
          payeeLockingScriptHex,
          vaultTxid: utxo.txid,
          vaultVout: utxo.vout,
          vaultSatoshis: utxo.satoshis,
          feeSats: planned.feeSats,
          changeSats: planned.changeSats,
          createdAt: now(),
          createdBy: identityKey.toLowerCase(),
          approvals: [{
            identityKey: identityKey.toLowerCase(),
            role: signer.role,
            derivedPubkey: derivedPubkey.toLowerCase(),
            signature,
            at: now()
          }],
          p2msSigs: [],
          status: 'open' as const
        }
        item.proposals.unshift(proposal)
        pushFeed(
          item,
          'proposed',
          `${ROLE_LABEL[signer.role]} proposed ${amountSats.toLocaleString()} sats to ${shortKey(payeeIdentityKey, 10)} — ${memo}`
        )
        return item
      })
      res.status(201).json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      bad(res, message === 'treasury not found' ? 404 : 400, message)
    }
  })

  app.post('/treasuries/:id/proposals/:proposalId/approve', async (req, res) => {
    const identityKey = typeof req.body?.identityKey === 'string' ? req.body.identityKey.trim() : ''
    const derivedPubkey = typeof req.body?.derivedPubkey === 'string' ? req.body.derivedPubkey.trim() : ''
    const signature = Array.isArray(req.body?.signature) ? req.body.signature.map((n: unknown) => Number(n)) : []
    if (!IDENTITY.test(identityKey) || !IDENTITY.test(derivedPubkey) || signature.length < 8) {
      bad(res, 400, 'identityKey, derivedPubkey, and signature are required')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        const proposal = item.proposals.find((row) => row.id === req.params.proposalId)
        if (!proposal) throw new Error('proposal not found')
        if (proposal.status === 'paid') throw new Error('already paid')
        const signer = findSigner(item, identityKey, derivedPubkey, proposal.approvals)
        if (!signer?.derivedPubkey) throw new Error('only a joined signer can approve')
        if (signer.derivedPubkey !== derivedPubkey.toLowerCase()) {
          throw new Error('derived pubkey does not match the joined seat')
        }
        const dataBytes = canonicalProposalBytes({
          v: 1,
          treasuryId: item.id,
          proposalId: proposal.id,
          amountSats: proposal.amountSats,
          payeeIdentityKey: proposal.payeeIdentityKey,
          memo: proposal.memo,
          payeeLockingScriptHex: proposal.payeeLockingScriptHex
        })
        if (!verifyWalletDataSignature(derivedPubkey, dataBytes, signature)) {
          throw new Error('approval signature did not verify')
        }
        if (!proposal.approvals.some((row) => row.role === signer.role)) {
          proposal.approvals.push({
            identityKey: identityKey.toLowerCase(),
            role: signer.role,
            derivedPubkey: derivedPubkey.toLowerCase(),
            signature,
            at: now()
          })
          pushFeed(item, 'approved', `${ROLE_LABEL[signer.role]} approved “${proposal.memo}”.`)
        }
        const count = uniqueApprovers(proposal.approvals).length
        if (proposal.status !== 'approved' && thresholdMet(count, item.threshold)) {
          proposal.status = 'approved'
          pushFeed(
            item,
            'approved',
            `Threshold met for “${proposal.memo}”. Two vault signatures will send ${proposal.amountSats.toLocaleString()} sats.`
          )
        }
        return item
      })
      res.json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = message === 'treasury not found' || message === 'proposal not found' ? 404 : 400
      bad(res, status, message)
    }
  })

  app.post('/treasuries/:id/proposals/:proposalId/p2ms-sig', async (req, res) => {
    const identityKey = typeof req.body?.identityKey === 'string' ? req.body.identityKey.trim() : ''
    const derivedPubkey = typeof req.body?.derivedPubkey === 'string' ? req.body.derivedPubkey.trim() : ''
    const signature = Array.isArray(req.body?.signature) ? req.body.signature.map((n: unknown) => Number(n)) : []
    if (!IDENTITY.test(identityKey) || !IDENTITY.test(derivedPubkey) || signature.length < 8) {
      bad(res, 400, 'identityKey, derivedPubkey, and signature are required')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        const proposal = item.proposals.find((row) => row.id === req.params.proposalId)
        if (!proposal) throw new Error('proposal not found')
        if (proposal.status === 'paid') throw new Error('already paid')
        const signer = findSigner(item, identityKey, derivedPubkey, proposal.p2msSigs)
        if (!signer?.derivedPubkey) throw new Error('only a joined signer can sign the vault')
        if (signer.derivedPubkey !== derivedPubkey.toLowerCase()) {
          throw new Error('derived pubkey does not match the joined seat')
        }
        if (!thresholdMet(uniqueApprovers(proposal.approvals).length, item.threshold)) {
          throw new Error('policy threshold not met yet')
        }
        if (!item.lockingScriptHex) throw new Error('vault locking script is missing')
        const signData = p2msSignData({
          sourceTXID: proposal.vaultTxid,
          sourceOutputIndex: proposal.vaultVout,
          sourceSatoshis: proposal.vaultSatoshis,
          vaultLockingScriptHex: item.lockingScriptHex,
          payeeLockingScriptHex: proposal.payeeLockingScriptHex,
          amountSats: proposal.amountSats,
          changeSats: proposal.changeSats,
          feeSats: proposal.feeSats
        })
        if (!verifyWalletDataSignature(derivedPubkey, signData, signature)) {
          throw new Error('vault signature did not verify against the planned spend')
        }
        if (!proposal.p2msSigs.some((row) => row.role === signer.role)) {
          proposal.p2msSigs.push({
            identityKey: identityKey.toLowerCase(),
            role: signer.role,
            derivedPubkey: derivedPubkey.toLowerCase(),
            signature,
            at: now()
          })
        }
        return item
      })
      res.json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = message === 'treasury not found' || message === 'proposal not found' ? 404 : 400
      bad(res, status, message)
    }
  })

  app.post('/treasuries/:id/proposals/:proposalId/paid', async (req, res) => {
    const txid = typeof req.body?.txid === 'string' ? req.body.txid.trim().toLowerCase() : ''
    const beef = Array.isArray(req.body?.beef) ? req.body.beef.map((n: unknown) => Number(n)) : []
    const changeVout = req.body?.changeVout == null ? null : Number(req.body.changeVout)
    if (!/^[0-9a-f]{64}$/.test(txid)) {
      bad(res, 400, 'txid is required')
      return
    }
    try {
      const treasury = await store.update((data) => {
        const item = data.treasuries.find((row) => row.id === req.params.id)
        if (!item) throw new Error('treasury not found')
        const proposal = item.proposals.find((row) => row.id === req.params.proposalId)
        if (!proposal) throw new Error('proposal not found')
        if (proposal.p2msSigs.length < item.threshold) {
          throw new Error('need two vault signatures before recording a payment')
        }
        proposal.status = 'paid'
        proposal.txid = txid
        item.vault = item.vault.filter(
          (utxo) => !(utxo.txid === proposal.vaultTxid && utxo.vout === proposal.vaultVout)
        )
        if (proposal.changeSats > 0 && Number.isInteger(changeVout) && changeVout !== null && beef.length > 0) {
          item.vault.push({
            txid,
            vout: changeVout,
            satoshis: proposal.changeSats,
            beef
          })
        }
        pushFeed(
          item,
          'paid',
          `Paid ${proposal.amountSats.toLocaleString()} sats for “${proposal.memo}”. txid ${txid.slice(0, 12)}…`
        )
        return item
      })
      res.json(publicTreasury(treasury))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = message === 'treasury not found' || message === 'proposal not found' ? 404 : 400
      bad(res, status, message)
    }
  })

  app.get('/treasuries/:id/export.csv', async (req, res) => {
    const data = await store.read()
    const treasury = data.treasuries.find((item) => item.id === req.params.id)
    if (!treasury) {
      bad(res, 404, 'treasury not found')
      return
    }
    const month = yearMonthOrCurrent(req.query.month)
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="${treasury.name.replace(/\s+/g, '-')}-${month}.csv"`)
    res.send(paymentsCsv(treasury, month))
  })

  app.get('/treasuries/:id/export.pdf', async (req, res) => {
    const data = await store.read()
    const treasury = data.treasuries.find((item) => item.id === req.params.id)
    if (!treasury) {
      bad(res, 404, 'treasury not found')
      return
    }
    const month = yearMonthOrCurrent(req.query.month)
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-disposition', `attachment; filename="${treasury.name.replace(/\s+/g, '-')}-${month}.pdf"`)
    res.send(paymentsPdf(treasury, month))
  })

  return app
}
