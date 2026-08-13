import {
  Beef,
  LockingScript,
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  DEMO_EVENT,
  PROTOCOL_ID,
  TICKET_TYPE,
  encodeTicketFields,
  parseTicketFields,
  type TicketPayload
} from '../../../protocol/ticket'
import { originator } from './config'
import { submitTicketTx } from './overlay'

export interface HeldTicket {
  outpoint: string
  satoshis: number
  ticket: TicketPayload
  customInstructions: string
  beef?: number[]
}

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
}

export interface TransferPackage {
  tx: number[]
  txid: string
  outputIndex: number
  protocolID: [0 | 1 | 2, string]
  keyID: string
  sender: string
  serial: string
  outpoint: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Ticket is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

export function isIdentityKey(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

function ticketFields(serial: string): number[][] {
  return encodeTicketFields({
    eventId: DEMO_EVENT.eventId,
    serial,
    kind: TICKET_TYPE,
    name: DEMO_EVENT.name,
    venue: DEMO_EVENT.venue,
    startsAt: DEMO_EVENT.startsAt
  })
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function beefForOutpoint(listedBeef: number[] | undefined, outpoint: string): number[] | undefined {
  if (!listedBeef || listedBeef.length === 0) return listedBeef
  const [txid] = outpoint.split('.')
  const beef = new Beef()
  beef.mergeBeef(listedBeef)
  if (beef.findTxid(txid)) return beef.toBinaryAtomic(txid)
  return listedBeef
}

function ticketOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    try {
      const ticket = parseTicketFields(PushDrop.decode(output.lockingScript).fields)
      if (ticket) return index
    } catch {
      // Change and unrelated outputs are ignored.
    }
  }
  return 0
}

export async function listHeldTickets(wallet: WalletClient): Promise<HeldTicket[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 1000
  })

  const held: HeldTicket[] = []
  for (const output of listed.outputs) {
    try {
      if (!output.lockingScript) continue
      const decoded = PushDrop.decode(LockingScript.fromHex(output.lockingScript))
      const ticket = parseTicketFields(decoded.fields)
      if (!ticket) continue
      held.push({
        outpoint: output.outpoint,
        satoshis: Number(output.satoshis ?? 1),
        ticket,
        customInstructions: output.customInstructions ?? '',
        beef: beefForOutpoint(listed.BEEF as number[] | undefined, output.outpoint)
      })
    } catch {
      // Skip non-ticket basket items.
    }
  }
  return held
}

export async function mintTickets(
  wallet: WalletClient,
  overlayUrl: string,
  count: number
): Promise<{ txid: string, count: number }> {
  if (count < 1 || count > 20) throw new Error('Mint between 1 and 20 tickets')

  const token = pushdrop(wallet)
  const outputs = []
  for (let serial = 1; serial <= count; serial++) {
    const keyID = randomKeyId()
    const lockingScript = await token.lock(
      ticketFields(String(serial)),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    )
    outputs.push({
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Demo Night ticket ${serial}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'mint', String(serial)]
    })
  }

  let response
  try {
    response = await wallet.createAction({
      description: `Mint ${count} Demo Night tickets`,
      outputs,
      labels: [BASKET, 'mint'],
      options: { randomizeOutputs: false }
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : String(err ?? '')
    throw new Error(
      detail.trim()
        ? `createAction failed: ${detail}`
        : 'createAction failed with no message. Spending Request timed out, was rejected, overlay is offline, or Desktop is locked.'
    )
  }

  if (!response.txid || !response.tx) {
    throw new Error(
      'Wallet did not return a minted transaction. Spending Request timed out, was rejected, or Desktop is locked.'
    )
  }

  const submitted = await submitTicketTx(overlayUrl, response.tx as number[])
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the mint (no outputs admitted)')
  }

  return { txid: response.txid, count: submitted.admitted.length }
}

async function spendTicket(
  wallet: WalletClient,
  held: HeldTicket,
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
  let response
  try {
    response = await wallet.createAction({
      description,
      inputBEEF: held.beef,
      inputs: [{
        inputDescription: 'Demo Night ticket',
        outpoint: held.outpoint,
        unlockingScriptLength: 73
      }],
      ...(newOutputs.length > 0 ? { outputs: newOutputs } : {}),
      labels: [BASKET],
      options: { randomizeOutputs: false }
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : String(err ?? '')
    throw new Error(
      detail.trim()
        ? `createAction failed: ${detail}`
        : 'createAction failed with no message. Spending Request timed out, was rejected, overlay is offline, or Desktop is locked.'
    )
  }

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

export async function transferTicket(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldTicket,
  recipientIdentityKey: string
): Promise<TransferPackage> {
  if (!isIdentityKey(recipientIdentityKey)) {
    throw new Error('Recipient must be a 66-hex compressed identity key')
  }

  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    ticketFields(held.ticket.serial),
    PROTOCOL_ID,
    keyID,
    recipientIdentityKey,
    false,
    false
  )

  const spent = await spendTicket(
    wallet,
    held,
    [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Transfer ticket ${held.ticket.serial}`
    }],
    `Transfer Demo Night ticket ${held.ticket.serial}`
  )

  const submitted = await submitTicketTx(overlayUrl, spent.tx)
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the transfer')
  }

  const { publicKey: sender } = await wallet.getPublicKey({ identityKey: true })
  const outputIndex = ticketOutputIndex(Transaction.fromBEEF(spent.tx))
  return {
    tx: spent.tx,
    txid: spent.txid,
    outputIndex,
    protocolID: PROTOCOL_ID,
    keyID,
    sender,
    serial: held.ticket.serial,
    outpoint: `${spent.txid}.${outputIndex}`
  }
}

export async function redeemTicket(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldTicket
): Promise<{ txid: string }> {
  const spent = await spendTicket(
    wallet,
    held,
    [],
    `Redeem Demo Night ticket ${held.ticket.serial}`
  )
  // Redeem admits no outputs; overlay still records the spend and drops the UTXO.
  await submitTicketTx(overlayUrl, spent.tx)
  return { txid: spent.txid }
}

export async function acceptTransfer(
  wallet: WalletClient,
  pack: TransferPackage
): Promise<void> {
  await wallet.internalizeAction({
    tx: pack.tx,
    outputs: [{
      outputIndex: pack.outputIndex,
      protocol: 'basket insertion',
      insertionRemittance: {
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: pack.protocolID,
          keyID: pack.keyID,
          counterparty: pack.sender
        }),
        tags: [BASKET, 'transfer', pack.serial]
      }
    }],
    description: `Accept Demo Night ticket ${pack.serial}`
  })
}

export function parseTransferPackage(raw: string): TransferPackage {
  const parsed = JSON.parse(raw) as TransferPackage
  if (!Array.isArray(parsed.tx) || !parsed.keyID || !parsed.sender || !parsed.serial) {
    throw new Error('Not a ticket transfer package')
  }
  return parsed
}
