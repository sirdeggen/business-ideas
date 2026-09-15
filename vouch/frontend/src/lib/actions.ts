import {
  P2PKH,
  PublicKey,
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  DEFAULT_BOND_SATS,
  FEE_SATS,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  TOKEN_SATS,
  canRelease,
  canSlash,
  encodeAttestFields,
  encodeReleaseFields,
  encodeSlashFields,
  encodeVouchFields,
  isIdentityKey,
  labelError,
  liveBond,
  makeVouchId,
  noteError,
  nowIso,
  parseVouchFields,
  reasonError,
  resolveNoteHash,
  subjectError,
  validateBond,
  type VouchToken
} from '../../../protocol/vouch'
import { originator } from './config'
import { BOND_NOT_LIVE, NOT_SLASHER, NOT_VOUCHER } from './copy'
import { resolveIdentity } from './identity'
import { nudgeVouch } from './messagebox'
import { cacheAttest, cacheVouch } from './persist'
import { submitVouchTx, txFromWalletBeef, type OverlayVouch } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
  vouchId?: string
}

export interface HeldBond {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  vouch: VouchToken
}

export interface VouchInput {
  label: string
  subject: string
  subjectIdentity: string
  slasher: string
  bondSats: number
}

export interface AttestInput {
  vouchId: string
  note: string
}

export interface SlashInput {
  reason: string
}

export interface WriteResult {
  vouchId: string
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toHex(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Bond is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function parseVouchScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): VouchToken | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseVouchFields(PushDrop.decode(lockingScript, position).fields)
      if (item && item.kind === 'vouch') return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export function writeFeeSats(): number {
  return FEE_SATS
}

export function defaultBondSats(): number {
  return DEFAULT_BOND_SATS
}

export function assertCanVouch(input: VouchInput): {
  label: string
  subject: string
  subjectIdentity: string
  slasher: string
  bondSats: number
} {
  const label = input.label.trim().replace(/\s+/g, ' ')
  const invalidLabel = labelError(label)
  if (invalidLabel) throw new Error(invalidLabel)
  const subject = input.subject.trim().replace(/\s+/g, ' ')
  const invalidSubject = subjectError(subject)
  if (invalidSubject) throw new Error(invalidSubject)
  const subjectIdentity = input.subjectIdentity.trim()
  if (subjectIdentity && !isIdentityKey(subjectIdentity)) {
    throw new Error('Subject identity must be an identity key.')
  }
  const slasher = input.slasher.trim()
  if (slasher && !isIdentityKey(slasher)) {
    throw new Error('Slasher must be an identity key.')
  }
  const bondError = validateBond(input.bondSats)
  if (bondError) throw new Error(bondError)
  return { label, subject, subjectIdentity, slasher, bondSats: input.bondSats }
}

export function assertCanAttest(input: AttestInput): { vouchId: string, note: string } {
  const vouchId = input.vouchId.trim().toLowerCase()
  if (!vouchId) throw new Error('Look up a vouch first.')
  const note = input.note.trim()
  const invalid = noteError(note)
  if (invalid) throw new Error(invalid)
  return { vouchId, note }
}

export function assertCanSlash(
  vouch: Pick<VouchToken, 'voucher' | 'slasher' | 'vouchId' | 'timestamp'>,
  identityKey: string,
  closures: Array<Pick<{ vouchId: string, timestamp: string }, 'vouchId' | 'timestamp'>> = []
): void {
  if (!canSlash(vouch, identityKey)) throw new Error(NOT_SLASHER)
  if (!liveBond(vouch, closures)) throw new Error(BOND_NOT_LIVE)
}

export function assertCanReleaseBond(
  vouch: Pick<VouchToken, 'voucher' | 'vouchId' | 'timestamp'>,
  identityKey: string,
  closures: Array<Pick<{ vouchId: string, timestamp: string }, 'vouchId' | 'timestamp'>> = []
): void {
  if (!canRelease(vouch, identityKey)) throw new Error(NOT_VOUCHER)
  if (!liveBond(vouch, closures)) throw new Error(BOND_NOT_LIVE)
}

async function finishAction(
  wallet: WalletClient,
  response: Awaited<ReturnType<WalletClient['createAction']>>
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a vouch transaction'), { cause: response })
  }
  return { txid, tx }
}

async function overlayOrError(
  overlayUrl: string,
  tx: number[],
  vouchId: string,
  txid: string
): Promise<WriteResult> {
  try {
    await submitVouchTx(overlayUrl, tx)
    return { vouchId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      vouchId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function listHeldBonds(wallet: WalletClient): Promise<HeldBond[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldBond[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      const vouch = parseVouchScript(locking)
      if (!vouch) continue
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? vouch.bondSats),
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        vouch
      })
    } catch {
      // Skip outputs this desk cannot parse.
    }
  }
  return held
}

function spendInput(held: Pick<HeldBond, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Slashable vouch',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

async function spendBond(
  wallet: WalletClient,
  held: HeldBond,
  newOutputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }>,
  description: string
): Promise<{ txid: string, tx: number[] }> {
  const instructions = parseInstructions(held.customInstructions)
  const response = await wallet.createAction({
    description,
    inputBEEF: held.beef,
    inputs: [spendInput(held)],
    ...(newOutputs.length > 0 ? { outputs: newOutputs } : {}),
    labels: [BASKET],
    options: { randomizeOutputs: false }
  })

  if (!response.signableTransaction) {
    throw new Error('Wallet did not return a signable spend')
  }

  const txToSign = Transaction.fromBEEF(response.signableTransaction.tx)
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    instructions.protocolID,
    instructions.keyID,
    instructions.counterparty,
    'all',
    false,
    held.satoshis
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build unlocking script')

  const signed = await wallet.signAction({
    reference: response.signableTransaction.reference,
    spends: {
      '0': { unlockingScript }
    }
  })

  if (!signed.txid || !signed.tx) {
    throw new Error('Wallet did not return a signed transaction')
  }
  return { txid: signed.txid, tx: signed.tx as number[] }
}

export async function stakeVouch(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: VouchInput,
  now = new Date()
): Promise<WriteResult> {
  const ready = assertCanVouch(input)
  let slasher = ready.slasher || identityKey
  if (ready.slasher && !isIdentityKey(ready.slasher)) {
    slasher = await resolveIdentity(ready.slasher)
  }
  const timestamp = nowIso(now)
  const vouchId = makeVouchId({
    voucher: identityKey,
    subject: ready.subject,
    timestamp,
    nonce: randomNonce()
  })
  const token = {
    vouchId,
    label: ready.label,
    subject: ready.subject,
    subjectIdentity: ready.subjectIdentity,
    voucher: identityKey,
    slasher,
    bondSats: ready.bondSats,
    writeFeeSats: FEE_SATS,
    timestamp
  }
  const keyID = randomKeyId()
  const lockToSelf = slasher === identityKey
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeVouchFields(token),
      PROTOCOL_ID,
      keyID,
      lockToSelf ? 'self' : slasher,
      lockToSelf,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Vouch ${ready.subject}`,
    outputs: [
      {
        satoshis: FEE_SATS,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Vouch write fee for ${ready.subject}`
      },
      {
        satoshis: ready.bondSats,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Vouch bond ${ready.label}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: lockToSelf ? 'self' : slasher,
          vouchId
        }),
        tags: [BASKET, 'vouch', vouchId]
      }
    ],
    labels: [BASKET, 'vouch'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  cacheVouch({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'vouch',
    ...token,
    txid,
    outputIndex: 1
  })
  await nudgeVouch(wallet, identityKey, slasher, {
    kind: 'vouch',
    vouchId,
    txid
  })
  return overlayOrError(overlayUrl, tx, vouchId, txid)
}

export async function attestVouch(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: AttestInput,
  now = new Date()
): Promise<WriteResult> {
  const ready = assertCanAttest(input)
  const timestamp = nowIso(now)
  const noteHash = resolveNoteHash(ready.note)
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeAttestFields({
        vouchId: ready.vouchId,
        attestor: identityKey,
        note: ready.note,
        noteHash,
        writeFeeSats: FEE_SATS,
        timestamp
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Attest ${ready.vouchId}`,
    outputs: [
      {
        satoshis: FEE_SATS,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Attest write fee for ${ready.vouchId}`
      },
      {
        satoshis: TOKEN_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Attest ${ready.vouchId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          vouchId: ready.vouchId
        }),
        tags: [BASKET, 'attest', ready.vouchId]
      }
    ],
    labels: [BASKET, 'attest'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  cacheAttest({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    vouchId: ready.vouchId,
    attestor: identityKey,
    note: ready.note,
    noteHash,
    writeFeeSats: FEE_SATS,
    timestamp,
    txid,
    outputIndex: 1
  })
  return overlayOrError(overlayUrl, tx, ready.vouchId, txid)
}

export async function slashVouch(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  held: HeldBond,
  input: SlashInput
): Promise<WriteResult> {
  const reason = input.reason.trim().replace(/\s+/g, ' ')
  const invalid = reasonError(reason)
  if (invalid) throw new Error(invalid)
  assertCanSlash(held.vouch, identityKey)
  const timestamp = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeSlashFields({
        vouchId: held.vouch.vouchId,
        slasher: identityKey,
        reason,
        timestamp
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const payout = held.satoshis > TOKEN_SATS ? held.satoshis - TOKEN_SATS : 0
  const signed = await spendBond(wallet, held, [
    ...(payout > 0
      ? [{
        satoshis: payout,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Slashed bond ${held.vouch.label}`
      }]
      : []),
    {
      satoshis: payout > 0 ? TOKEN_SATS : held.satoshis,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Slash ${held.vouch.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        vouchId: held.vouch.vouchId
      }),
      tags: [BASKET, 'slash', held.vouch.vouchId]
    }
  ], `Slash vouch: ${held.vouch.label}`)

  await nudgeVouch(wallet, identityKey, held.vouch.voucher, {
    kind: 'slash',
    vouchId: held.vouch.vouchId,
    txid: signed.txid
  })
  return overlayOrError(overlayUrl, signed.tx, held.vouch.vouchId, signed.txid)
}

export async function releaseVouch(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  held: HeldBond
): Promise<WriteResult> {
  assertCanReleaseBond(held.vouch, identityKey)
  const timestamp = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReleaseFields({
        vouchId: held.vouch.vouchId,
        voucher: identityKey,
        timestamp
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const payout = held.satoshis > TOKEN_SATS ? held.satoshis - TOKEN_SATS : 0
  const signed = await spendBond(wallet, held, [
    ...(payout > 0
      ? [{
        satoshis: payout,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Released bond ${held.vouch.label}`
      }]
      : []),
    {
      satoshis: payout > 0 ? TOKEN_SATS : held.satoshis,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Release ${held.vouch.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        vouchId: held.vouch.vouchId
      }),
      tags: [BASKET, 'release', held.vouch.vouchId]
    }
  ], `Release vouch: ${held.vouch.label}`)

  return overlayOrError(overlayUrl, signed.tx, held.vouch.vouchId, signed.txid)
}

export function heldForVouch(held: HeldBond[], vouchId: string): HeldBond | undefined {
  return held.find((item) => item.vouch.vouchId === vouchId)
}

export function overlayAsHeld(row: OverlayVouch): Pick<VouchToken, 'voucher' | 'slasher' | 'vouchId' | 'timestamp'> {
  return row
}
