import {
  LockingScript,
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL,
  EXPORT_PRICE_SATS,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  encodeRecordFields,
  isIdentityKey,
  parseRecordFields,
  recordHash,
  validateRecord,
  type RecordKind
} from '../../../protocol/record'
import { originator } from './config'
import { submitRecordTx, type OverlayRecord } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface PostInput {
  name: string
  kind: RecordKind
  note: string
  lat: string
  lon: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

export interface PostResult {
  txid: string
  hash: string
  overlayError?: string
}

export interface HeldInspection {
  held: OverlayRecord[]
}

const EMPTY_HELD: HeldInspection = { held: [] }

function lockingScriptOf(raw: unknown): LockingScript | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const hex = raw.trim()
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null
    try {
      return LockingScript.fromHex(hex)
    } catch {
      return null
    }
  }
  if (typeof raw === 'object' && raw !== null && 'toHex' in raw) {
    return raw as LockingScript
  }
  return null
}

function recordFromScript(script: LockingScript, txid: string, outputIndex: number): OverlayRecord | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseRecordFields(PushDrop.decode(script, position).fields)
      if (item) return { ...item, txid, outputIndex }
    } catch {
      // Try the other PushDrop field position.
    }
  }
  return null
}

/** Basket `records` only after a wallet is connected. No wallet → no listOutputs. */
export async function inspectHeldRecords(wallet?: unknown): Promise<HeldInspection> {
  if (!wallet) return EMPTY_HELD
  const client = wallet as WalletClient
  if (typeof client.listOutputs !== 'function') return EMPTY_HELD
  const listed = await withTimeout(
    client.listOutputs({
      basket: BASKET,
      include: 'locking scripts',
      includeCustomInstructions: true,
      limit: 200
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const held: OverlayRecord[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid, vout] = outpoint.split('.')
    const outputIndex = Number(vout)
    const script = lockingScriptOf(output.lockingScript)
    if (!txid || !Number.isFinite(outputIndex) || !script) continue
    const row = recordFromScript(script, txid, outputIndex)
    if (row) held.push(row)
  }
  return { held }
}

export async function postRecord(
  wallet: WalletClient,
  overlayUrl: string,
  input: PostInput
): Promise<PostResult> {
  const item = {
    name: input.name.trim(),
    kind: input.kind,
    note: input.note.trim(),
    time: new Date().toISOString(),
    lat: input.lat.trim(),
    lon: input.lon.trim()
  }
  const fields = encodeRecordFields(item)
  const hash = recordHash(item)
  const invalid = validateRecord({
    magic: MAGIC,
    schemaVersion: SCHEMA_VERSION,
    hash,
    ...item
  })
  if (invalid) {
    if (invalid.includes('name')) throw new Error('Name is required (1–80 characters).')
    if (invalid.includes('note')) throw new Error('Write the reading before posting.')
    throw new Error(invalid)
  }

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      fields,
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  // Do not 8s-abort createAction — that races the Authorize click and drops the spend.
  const response = await wallet.createAction({
    description: `Post signed record ${item.kind}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Signed ${item.kind} from ${item.name}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'post', item.kind]
    }],
    labels: [BASKET, 'post'],
    options: { randomizeOutputs: false }
  })

  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
    if (!txid || !tx) {
      throw Object.assign(new Error('signAction returned no txid/tx'), { cause: signed })
    }
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('createAction returned no txid/tx'), { cause: response })
  }

  try {
    const submitted = await submitRecordTx(overlayUrl, tx)
    if (submitted.admitted.length === 0) {
      return {
        txid,
        hash,
        overlayError: `no record outputs parsed after submit to ${submitted.topic} at ${submitted.host}`
      }
    }
    return { txid, hash }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid,
      hash,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export interface ExportDump {
  hash: string
  name: string
  kind: RecordKind
  note: string
  time: string
  txid: string
}

export interface ExportResult {
  payTxid: string
  dump: ExportDump
  paidSats: number
}

function receiptFields(hash: string): number[][] {
  return [
    Array.from(new TextEncoder().encode('exported')),
    Array.from(new TextEncoder().encode(hash)),
    Array.from(new TextEncoder().encode(new Date().toISOString()))
  ]
}

async function brc29PaymentOutput(
  wallet: WalletClient,
  payee: string,
  satoshis: number
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  customInstructions: string
}> {
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: payee,
    forSelf: false
  })
  const lockingScript = new P2PKH().lock(PublicKey.fromString(publicKey).toHash())
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription: `Export payment for ${hashShort(payee)}`,
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee
    })
  }
}

function hashShort(value: string): string {
  return value.length > 16 ? `${value.slice(0, 10)}…` : value
}

export function exportPriceSats(record: OverlayRecord): number {
  return isIdentityKey(record.name) ? EXPORT_PRICE_SATS : 1
}

export async function payAndExport(
  wallet: WalletClient,
  record: OverlayRecord
): Promise<ExportResult> {
  const keyID = randomKeyId()
  const receiptScript = await withTimeout(
    pushdrop(wallet).lock(
      receiptFields(record.hash),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const outputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }> = [{
    satoshis: 1,
    lockingScript: receiptScript.toHex(),
    outputDescription: `Export receipt ${hashShort(record.hash)}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self'
    }),
    tags: [BASKET, 'exported', record.hash]
  }]

  let paidSats = 1
  if (isIdentityKey(record.name)) {
    const payment = await brc29PaymentOutput(wallet, record.name, EXPORT_PRICE_SATS)
    outputs.unshift({
      satoshis: payment.satoshis,
      lockingScript: payment.lockingScript,
      outputDescription: payment.outputDescription,
      customInstructions: payment.customInstructions
    })
    paidSats = EXPORT_PRICE_SATS
  }

  // Do not 8s-abort createAction — Desktop Authorize must stay up.
  const response = await wallet.createAction({
    description: `Pay to export record ${hashShort(record.hash)}`,
    outputs,
    labels: [BASKET, 'export'],
    options: { randomizeOutputs: false }
  })

  let txid = response.txid
  if (!txid && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
  }
  if (!txid) {
    throw Object.assign(new Error('createAction returned no txid'), { cause: response })
  }

  return {
    payTxid: txid,
    paidSats,
    dump: {
      hash: record.hash,
      name: record.name,
      kind: record.kind,
      note: record.note,
      time: record.time,
      txid: record.txid
    }
  }
}

export function downloadDump(dump: ExportDump): void {
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `record-${dump.hash.slice(0, 12)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
