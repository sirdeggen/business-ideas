import {
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  DUMP_MAX,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  TRANSFER_SATS,
  encodeExportFields,
  encodeTitleFields,
  formatSats,
  isHolder,
  isIdentityKey,
  makeTitleId,
  parseTitleFields,
  resolveDocHash,
  validatePrice,
  validateTitle,
  type TitleToken
} from '../../../protocol/title'
import { originator } from './config'
import { NOT_HOLDER } from './copy'
import { resolveIdentity } from './identity'
import { acceptTransfer, pullTransfers, sendTransfer } from './messagebox'
import { submitTitleTx, txFromWalletBeef, type OverlayTitle } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
  titleId?: string
  dump?: string
}

export interface HeldTitle {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  title: TitleToken
  dump: string
}

export interface IssueInput {
  label: string
  document: string
  priceSats: number
}

export interface IssueResult {
  titleId: string
  txid: string
  docHash: string
  overlayError?: string
}

export interface TransferResult {
  titleId: string
  txid: string
  overlayError?: string
}

export interface ExportReading {
  label: string
  docHash: string
  titleId: string
  issued: string
  exported: string
  dump: string
}

export interface ExportResult {
  reading: ExportReading
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

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Title is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function parseTitleScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): TitleToken | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseTitleFields(PushDrop.decode(lockingScript, position).fields)
      if (item && item.kind === 'title') return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function titleOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    if (parseTitleScript(output.lockingScript)) return index
  }
  return 0
}

export function transferSpendInput(held: Pick<HeldTitle, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Title token',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

export function issuePriceSats(input: Pick<IssueInput, 'priceSats'>): number {
  return input.priceSats
}

export { formatSats }

export function assertCanIssue(input: IssueInput): void {
  if (!input.label.trim()) throw new Error('Title is required.')
  if (!input.document.trim()) throw new Error('Paste the document, or a document hash.')
  if (input.document.length > DUMP_MAX) throw new Error('Document too long for v0.')
  const docHash = resolveDocHash(input.document)
  if (!docHash) throw new Error('Paste the document, or a document hash.')
  const priceError = validatePrice(input.priceSats)
  if (priceError) throw new Error(priceError)
}

export function assertCanTransfer(title: Pick<TitleToken, 'holder'>, identityKey: string): void {
  if (!isHolder(title, identityKey)) throw new Error(NOT_HOLDER)
}

export function assertCanExport(title: Pick<TitleToken, 'holder'>, identityKey: string): void {
  if (!isHolder(title, identityKey)) throw new Error(NOT_HOLDER)
}

export async function listHeldTitles(wallet: WalletClient): Promise<HeldTitle[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldTitle[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      const title = parseTitleScript(locking)
      if (!title) continue
      const instructions = output.customInstructions
        ? parseInstructions(output.customInstructions)
        : null
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? 1),
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        title,
        dump: instructions?.dump?.trim() ?? ''
      })
    } catch {
      // Skip outputs this desk cannot parse.
    }
  }
  return held
}

export async function fulfillTransfers(wallet: WalletClient): Promise<void> {
  const notices = await pullTransfers(wallet)
  for (const notice of notices) {
    try {
      await acceptTransfer(wallet, notice)
    } catch {
      // Already internalized, or wallet declined.
    }
  }
}

async function spendTitle(
  wallet: WalletClient,
  held: HeldTitle,
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
    inputs: [transferSpendInput(held)],
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

export async function issueTitle(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: IssueInput
): Promise<IssueResult> {
  assertCanIssue(input)
  const timestamp = nowIso()
  const dump = input.document
  const docHash = resolveDocHash(dump)
  const titleId = makeTitleId(identityKey, input.label.trim(), timestamp, randomNonce())
  const token = {
    titleId,
    label: input.label.trim(),
    docHash,
    holder: identityKey,
    issuer: identityKey,
    priceSats: input.priceSats,
    timestamp
  }
  const invalid = validateTitle({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'title',
    ...token
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeTitleFields(token),
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
    description: `Issue title: ${token.label}`,
    outputs: [{
      satoshis: input.priceSats,
      lockingScript: lockingScript.toHex(),
      outputDescription: token.label,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        titleId,
        dump
      }),
      tags: [BASKET, 'title', titleId]
    }],
    labels: [BASKET, 'issue'],
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
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return an issue transaction'), { cause: response })
  }

  try {
    await submitTitleTx(overlayUrl, tx)
    return { titleId, txid, docHash }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      titleId,
      txid,
      docHash,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function transferTitle(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  held: HeldTitle,
  recipientInput: string
): Promise<TransferResult> {
  assertCanTransfer(held.title, identityKey)
  const recipient = await resolveIdentity(recipientInput)
  if (!isIdentityKey(recipient)) {
    throw new Error('Write a name or an account to transfer to.')
  }
  if (recipient === identityKey) {
    throw new Error('That account already holds this title.')
  }

  const keyID = randomKeyId()
  const next = {
    titleId: held.title.titleId,
    label: held.title.label,
    docHash: held.title.docHash,
    holder: recipient,
    issuer: held.title.issuer,
    priceSats: held.title.priceSats,
    timestamp: nowIso()
  }
  const invalid = validateTitle({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'title',
    ...next
  })
  if (invalid) throw new Error(invalid)

  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeTitleFields(next),
      PROTOCOL_ID,
      keyID,
      recipient,
      false,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const spent = await spendTitle(
    wallet,
    held,
    [{
      satoshis: TRANSFER_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: held.title.label,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: identityKey,
        titleId: held.title.titleId,
        dump: held.dump
      })
    }],
    `Transfer title: ${held.title.label}`
  )

  const outputIndex = titleOutputIndex(txFromWalletBeef(spent.tx))
  await sendTransfer(wallet, recipient, {
    kind: 'transfer',
    titleId: held.title.titleId,
    tx: spent.tx,
    txid: spent.txid,
    outputIndex,
    keyID,
    sender: identityKey,
    dump: held.dump || undefined
  })

  try {
    await submitTitleTx(overlayUrl, spent.tx)
    return { titleId: held.title.titleId, txid: spent.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      titleId: held.title.titleId,
      txid: spent.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function exportTitle(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: OverlayTitle,
  held: HeldTitle | null
): Promise<ExportResult> {
  assertCanExport(row, identityKey)
  const timestamp = nowIso()
  const dump = held?.dump ?? ''
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeExportFields({
        titleId: row.titleId,
        holder: identityKey,
        docHash: row.docHash,
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
    description: `Export title: ${row.label}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Export ${row.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        titleId: row.titleId
      }),
      tags: [BASKET, 'export', row.titleId]
    }],
    labels: [BASKET, 'export'],
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
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return an export transaction'), { cause: response })
  }

  const reading: ExportReading = {
    label: row.label,
    docHash: row.docHash,
    titleId: row.titleId,
    issued: row.timestamp,
    exported: timestamp,
    dump
  }

  try {
    await submitTitleTx(overlayUrl, tx)
    return { reading, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      reading,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export function downloadReading(reading: ExportReading): void {
  const slug = reading.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const body = JSON.stringify({
    kind: 'custody-reading',
    label: reading.label,
    docHash: reading.docHash,
    titleId: reading.titleId,
    issued: reading.issued,
    exported: reading.exported,
    document: reading.dump || undefined
  }, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${slug || 'title'}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
