import {
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  encodeDrawFields,
  encodeHeaderFields,
  encodeTicketFields,
  isIdentityKey,
  liveTickets,
  makeRaffleId,
  nextTicketIndex,
  parseRaffleFields,
  validateHeader,
  validateTicket,
  type RaffleHeader,
  type RaffleTicket
} from '../../../protocol/raffle'
import { originator } from './config'
import {
  submitRaffleTx,
  txFromWalletBeef,
  type OverlayDraw,
  type OverlayHeader,
  type OverlayTicket
} from './overlay'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
}

export interface HeldTicket {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  ticket: RaffleTicket
}

export interface StartInput {
  title: string
  whoCanEnter: string
  ticketCount: number
  transferable: boolean
  drawNote: string
  terms: string
}

export interface StartResult {
  raffleId: string
  txid: string
  overlayError?: string
}

export interface TicketResult {
  txid: string
  ticketIndex: number
  outpoint: string
  overlayError?: string
}

export interface DrawResult {
  txid: string
  winningOutpoint: string
  winningIndex: number
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
    throw new Error('Ticket is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

export function assertHostCanDraw(hostIdentity: string, visitorIdentity: string): void {
  if (!visitorIdentity || visitorIdentity !== hostIdentity) {
    throw new Error('Only the host can draw this raffle.')
  }
}

export function pickLiveWinner(tickets: OverlayTicket[], draws: OverlayDraw[]): OverlayTicket {
  const live = liveTickets(tickets, draws) as OverlayTicket[]
  if (live.length === 0) throw new Error('No live tickets to draw.')
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return live[n % live.length]
}

/** createAction input that spends a held raffle ticket UTXO. */
export function transferSpendInput(held: Pick<HeldTicket, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Raffle ticket',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

function raffleOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    for (const position of ['before', 'after'] as const) {
      try {
        const item = parseRaffleFields(PushDrop.decode(output.lockingScript, position).fields)
        if (item) return index
      } catch {
        // Change and unrelated outputs are ignored.
      }
    }
  }
  return 0
}

export async function listHeldTickets(wallet: WalletClient): Promise<HeldTicket[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldTicket[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      let ticket: RaffleTicket | null = null
      for (const position of ['before', 'after'] as const) {
        try {
          const parsed = parseRaffleFields(PushDrop.decode(locking, position).fields)
          if (parsed?.kind === 'ticket') {
            ticket = parsed
            break
          }
        } catch {
          // Try the other lock() position.
        }
      }
      if (!ticket) continue
      held.push({
        outpoint,
        satoshis: output.satoshis ?? 1,
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        ticket
      })
    } catch {
      // Skip outputs the wallet listed that are not raffle tickets.
    }
  }
  return held
}

export async function startRaffle(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: StartInput
): Promise<StartResult> {
  const timestamp = nowIso()
  const raffleId = makeRaffleId(identityKey, input.title.trim(), timestamp, randomNonce())
  const header: Omit<RaffleHeader, 'magic' | 'version' | 'kind'> = {
    raffleId,
    host: identityKey,
    title: input.title.trim(),
    whoCanEnter: input.whoCanEnter.trim(),
    ticketCount: input.ticketCount,
    transferable: input.transferable,
    drawNote: input.drawNote.trim(),
    terms: input.terms.trim(),
    timestamp
  }
  const invalid = validateHeader({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'header',
    ...header
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeHeaderFields(header),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Start raffle: ${header.title}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: header.title,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'header', raffleId]
    }],
    labels: [BASKET, 'start'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a raffle transaction')
  }

  try {
    await submitRaffleTx(overlayUrl, response.tx as number[])
    return { raffleId, txid: response.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      raffleId,
      txid: response.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function claimTicket(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  header: OverlayHeader,
  tickets: OverlayTicket[]
): Promise<TicketResult> {
  const ticketIndex = nextTicketIndex(header, tickets)
  if (ticketIndex == null) throw new Error('No tickets left to claim.')
  const ticket: Omit<RaffleTicket, 'magic' | 'version' | 'kind'> = {
    raffleId: header.raffleId,
    ticketIndex,
    holder: identityKey,
    timestamp: nowIso()
  }
  const invalid = validateTicket({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'ticket',
    ...ticket
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeTicketFields(ticket),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Claim raffle ticket ${ticketIndex}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `${header.title} ticket ${ticketIndex}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'ticket', header.raffleId, String(ticketIndex)]
    }],
    labels: [BASKET, 'claim'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a ticket transaction')
  }

  const outputIndex = raffleOutputIndex(txFromWalletBeef(response.tx as number[]))
  try {
    await submitRaffleTx(overlayUrl, response.tx as number[])
    return {
      txid: response.txid,
      ticketIndex,
      outpoint: `${response.txid}.${outputIndex}`
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid: response.txid,
      ticketIndex,
      outpoint: `${response.txid}.${outputIndex}`,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
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

export async function passTicket(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldTicket,
  senderIdentityKey: string,
  recipientIdentityKey: string
): Promise<TicketResult> {
  if (!isIdentityKey(recipientIdentityKey)) {
    throw new Error('Recipient must be a 66-hex compressed identity key')
  }
  const keyID = randomKeyId()
  const ticket: Omit<RaffleTicket, 'magic' | 'version' | 'kind'> = {
    raffleId: held.ticket.raffleId,
    ticketIndex: held.ticket.ticketIndex,
    holder: recipientIdentityKey,
    timestamp: nowIso(),
    keyID,
    sender: senderIdentityKey
  }
  const lockingScript = await pushdrop(wallet).lock(
    encodeTicketFields(ticket),
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
      outputDescription: `Pass raffle ticket ${held.ticket.ticketIndex}`
    }],
    `Pass raffle ticket ${held.ticket.ticketIndex}`
  )

  const outputIndex = raffleOutputIndex(txFromWalletBeef(spent.tx))
  try {
    await submitRaffleTx(overlayUrl, spent.tx)
    return {
      txid: spent.txid,
      ticketIndex: held.ticket.ticketIndex,
      outpoint: `${spent.txid}.${outputIndex}`
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid: spent.txid,
      ticketIndex: held.ticket.ticketIndex,
      outpoint: `${spent.txid}.${outputIndex}`,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function acceptPass(
  wallet: WalletClient,
  beef: number[],
  ticket: OverlayTicket
): Promise<void> {
  if (!ticket.keyID || !ticket.sender) {
    throw new Error('This ticket has no pass package to receive.')
  }
  await wallet.internalizeAction({
    tx: beef,
    outputs: [{
      outputIndex: ticket.outputIndex,
      protocol: 'basket insertion',
      insertionRemittance: {
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: ticket.keyID,
          counterparty: ticket.sender
        }),
        tags: [BASKET, 'transfer', ticket.raffleId, String(ticket.ticketIndex)]
      }
    }],
    description: `Receive raffle ticket ${ticket.ticketIndex}`
  })
}

export async function drawWinner(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  header: OverlayHeader,
  tickets: OverlayTicket[],
  draws: OverlayDraw[]
): Promise<DrawResult> {
  assertHostCanDraw(header.host, identityKey)
  if (draws.length > 0) throw new Error('This raffle already has a winner.')
  const winner = pickLiveWinner(tickets, draws)
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeDrawFields({
      raffleId: header.raffleId,
      winningOutpoint: `${winner.txid}.${winner.outputIndex}`,
      winningIndex: winner.ticketIndex,
      timestamp: nowIso()
    }),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Draw winner for ${header.title}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Winner ticket ${winner.ticketIndex}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'draw', header.raffleId]
    }],
    labels: [BASKET, 'draw'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a draw transaction')
  }

  try {
    await submitRaffleTx(overlayUrl, response.tx as number[])
    return {
      txid: response.txid,
      winningOutpoint: `${winner.txid}.${winner.outputIndex}`,
      winningIndex: winner.ticketIndex
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid: response.txid,
      winningOutpoint: `${winner.txid}.${winner.outputIndex}`,
      winningIndex: winner.ticketIndex,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
