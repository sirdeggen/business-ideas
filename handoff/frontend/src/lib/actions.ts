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
  BRC29_PROTOCOL_ID,
  CONFIRM_SATS,
  LIST_SATS,
  PROTOCOL_ID,
  assertAssetType,
  assertDescription,
  assertPriceSats,
  assertTitle,
  canConfirm,
  canFund,
  canRelease,
  encodeConfirmFields,
  encodeFundFields,
  encodeListFields,
  encodeReleaseFields,
  isBuyer,
  isSeller,
  newListingId,
  nowIso,
  parseHandoffFields,
  protocolFeeSats,
  sellerPayoutSats,
  type AssetType,
  type HandoffParty
} from '../../../protocol/handoff'
import { originator } from './config'
import { NOT_BUYER, NOT_HOLDING, NOT_PARTY, NOT_SELLER } from './copy'
import { nudgeHandoff } from './messagebox'
import { lookupListing, submitHandoffTx, txFromWalletBeef, type OverlayFund, type OverlayList } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
  listingId?: string
}

export interface HeldFund {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  fund: OverlayFund
}

export interface ListInput {
  title: string
  assetType: string
  description: string
  priceSats: number
}

export interface ActionResult {
  listingId: string
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Listing is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function parseFundScript(lockingScript: Parameters<typeof PushDrop.decode>[0]) {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseHandoffFields(PushDrop.decode(lockingScript, position).fields)
      if (item && item.kind === 'fund') return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export function assertCanList(input: ListInput): {
  title: string
  assetType: AssetType
  description: string
  priceSats: number
} {
  assertTitle(input.title)
  const assetType = assertAssetType(input.assetType)
  assertDescription(input.description)
  assertPriceSats(input.priceSats)
  return {
    title: input.title.trim(),
    assetType,
    description: input.description.trim(),
    priceSats: input.priceSats
  }
}

export async function listHeldFunds(wallet: WalletClient): Promise<HeldFund[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldFund[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      const fund = parseFundScript(locking)
      if (!fund) continue
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? fund.amountSats),
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        fund: { ...fund, txid, outputIndex: vout }
      })
    } catch {
      // Skip outputs this desk cannot parse.
    }
  }
  return held
}

async function findHeldFund(wallet: WalletClient, listingId: string): Promise<HeldFund> {
  const held = await listHeldFunds(wallet)
  const match = held.find((row) => row.fund.listingId === listingId)
  if (!match) throw new Error(NOT_HOLDING)
  return match
}

function spendInput(held: Pick<HeldFund, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Funded escrow',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

async function spendFund(
  wallet: WalletClient,
  held: HeldFund,
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

async function overlayOrError(
  overlayUrl: string,
  tx: number[],
  listingId: string,
  txid: string
): Promise<ActionResult> {
  try {
    await submitHandoffTx(overlayUrl, tx)
    return { listingId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      listingId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

async function createFlag(
  wallet: WalletClient,
  fields: number[][],
  description: string,
  outputDescription: string,
  listingId: string,
  tag: string,
  satoshis: number
): Promise<{ txid: string, tx: number[] }> {
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

  const response = await wallet.createAction({
    description,
    outputs: [{
      satoshis,
      lockingScript: lockingScript.toHex(),
      outputDescription,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        listingId
      }),
      tags: [BASKET, tag, listingId]
    }],
    labels: [BASKET, tag],
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
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  return { txid, tx }
}

export async function listAsset(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: ListInput
): Promise<ActionResult> {
  const ready = assertCanList(input)
  const listingId = newListingId()
  const createdAt = nowIso()
  const signed = await createFlag(
    wallet,
    encodeListFields({
      listingId,
      title: ready.title,
      assetType: ready.assetType,
      description: ready.description,
      priceSats: ready.priceSats,
      sellerIdentity: identityKey,
      createdAt
    }),
    `List asset: ${ready.title}`,
    `Listing ${ready.title}`,
    listingId,
    'list',
    LIST_SATS
  )
  return overlayOrError(overlayUrl, signed.tx, listingId, signed.txid)
}

export async function fundEscrow(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  list: OverlayList
): Promise<ActionResult> {
  const live = await lookupListing(overlayUrl, list.listingId, list.txid)
  const current = live.list ?? list
  if (!canFund(live.status ?? 'listed')) {
    throw new Error('This listing is not waiting for escrow.')
  }
  if (isSeller(current, identityKey)) {
    throw new Error('The seller cannot fund their own listing.')
  }

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeFundFields({
        listingId: current.listingId,
        buyerIdentity: identityKey,
        amountSats: current.priceSats,
        fundedAt: nowIso()
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
    description: `Fund escrow: ${current.title}`,
    outputs: [{
      satoshis: current.priceSats,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Escrow ${current.title}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        listingId: current.listingId
      }),
      tags: [BASKET, 'fund', current.listingId]
    }],
    labels: [BASKET, 'fund'],
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
    throw Object.assign(new Error('Wallet did not return a fund transaction'), { cause: response })
  }

  void nudgeHandoff(wallet, identityKey, current.sellerIdentity, {
    kind: 'fund',
    listingId: current.listingId,
    txid
  })
  return overlayOrError(overlayUrl, tx, current.listingId, txid)
}

export async function confirmHandoff(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  list: OverlayList
): Promise<ActionResult> {
  const live = await lookupListing(overlayUrl, list.listingId, list.txid)
  const current = live.list ?? list
  if (!canConfirm(live.status)) {
    throw new Error('Confirm after escrow is funded.')
  }

  let party: HandoffParty | null = null
  if (isSeller(current, identityKey) && !live.sellerConfirm) party = 'seller'
  else if (live.fund && isBuyer(live.fund, identityKey) && !live.buyerConfirm) party = 'buyer'
  if (!party) throw new Error(NOT_PARTY)

  const signed = await createFlag(
    wallet,
    encodeConfirmFields({
      listingId: current.listingId,
      party,
      identity: identityKey,
      confirmedAt: nowIso()
    }),
    `Confirm handoff: ${current.title}`,
    `Confirm ${current.title}`,
    current.listingId,
    'confirm',
    CONFIRM_SATS
  )

  const counterpart = party === 'seller'
    ? live.fund?.buyerIdentity
    : current.sellerIdentity
  if (counterpart) {
    void nudgeHandoff(wallet, identityKey, counterpart, {
      kind: 'confirm',
      listingId: current.listingId,
      txid: signed.txid
    })
  }
  return overlayOrError(overlayUrl, signed.tx, current.listingId, signed.txid)
}

export async function releaseHandoff(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  list: OverlayList
): Promise<ActionResult> {
  const live = await lookupListing(overlayUrl, list.listingId, list.txid)
  const current = live.list ?? list
  if (!canRelease(live.status)) {
    throw new Error('Release after both parties confirm.')
  }
  if (!live.fund) throw new Error('This listing is not funded.')
  if (!isBuyer(live.fund, identityKey)) throw new Error(NOT_BUYER)
  const held = await findHeldFund(wallet, current.listingId)

  const feeSats = protocolFeeSats(current.priceSats)
  const sellerSats = sellerPayoutSats(current.priceSats)

  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: current.sellerIdentity,
    forSelf: false
  })
  const paymentScript = p2pkhFromPublicKey(derived)

  const receiptKeyId = randomKeyId()
  const receiptScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReleaseFields({
        listingId: current.listingId,
        sellerIdentity: current.sellerIdentity,
        buyerIdentity: identityKey,
        sellerSats,
        feeSats,
        releasedAt: nowIso()
      }),
      PROTOCOL_ID,
      receiptKeyId,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const receiptSats = Math.max(1, feeSats)
  const signed = await spendFund(wallet, held, [
    {
      satoshis: sellerSats,
      lockingScript: paymentScript,
      outputDescription: `Release ${current.title}`,
      customInstructions: JSON.stringify({
        derivationPrefix,
        derivationSuffix,
        payee: current.sellerIdentity
      })
    },
    {
      satoshis: receiptSats,
      lockingScript: receiptScript.toHex(),
      outputDescription: `Handoff ${current.title}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: receiptKeyId,
        counterparty: 'self',
        listingId: current.listingId
      }),
      tags: [BASKET, 'release', current.listingId]
    }
  ], `Release handoff: ${current.title}`)

  void nudgeHandoff(wallet, identityKey, current.sellerIdentity, {
    kind: 'release',
    listingId: current.listingId,
    txid: signed.txid
  })
  return overlayOrError(overlayUrl, signed.tx, current.listingId, signed.txid)
}

export { NOT_SELLER }
