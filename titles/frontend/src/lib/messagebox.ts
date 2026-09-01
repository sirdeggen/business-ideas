import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST, PROTOCOL_ID } from '../../../protocol/title'

export interface TransferNotice {
  kind: 'transfer'
  titleId: string
  tx: number[]
  txid: string
  outputIndex: number
  keyID: string
  sender: string
  dump?: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

function asNotice(body: unknown): TransferNotice | null {
  const raw = typeof body === 'string'
    ? (() => {
      try {
        return JSON.parse(body) as unknown
      } catch {
        return null
      }
    })()
    : body
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (
    row.kind !== 'transfer'
    || typeof row.titleId !== 'string'
    || !Array.isArray(row.tx)
    || typeof row.txid !== 'string'
    || typeof row.outputIndex !== 'number'
    || typeof row.keyID !== 'string'
    || typeof row.sender !== 'string'
  ) {
    return null
  }
  return {
    kind: 'transfer',
    titleId: row.titleId,
    tx: row.tx as number[],
    txid: row.txid,
    outputIndex: row.outputIndex,
    keyID: row.keyID,
    sender: row.sender,
    dump: typeof row.dump === 'string' ? row.dump : undefined
  }
}

export async function sendTransfer(
  wallet: WalletClient,
  recipient: string,
  notice: TransferNotice
): Promise<void> {
  const key = recipient.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body: notice
    }, MESSAGE_BOX_HOST)
  } catch {
    // Overlay already has the new holder. Basket handoff can retry later.
  }
}

export async function pullTransfers(wallet: WalletClient): Promise<TransferNotice[]> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    const parsed: TransferNotice[] = []
    const ids: string[] = []
    for (const message of messages) {
      const row = asNotice(message.body)
      if (!row) continue
      parsed.push(row)
      if (message.messageId) ids.push(String(message.messageId))
    }
    if (ids.length > 0) {
      try {
        await client.acknowledgeMessage({ messageIds: ids, host: MESSAGE_BOX_HOST })
      } catch {
        // Keep them readable on the next pull.
      }
    }
    return parsed
  } catch {
    return []
  }
}

export async function acceptTransfer(wallet: WalletClient, notice: TransferNotice): Promise<void> {
  await wallet.internalizeAction({
    tx: notice.tx,
    outputs: [{
      outputIndex: notice.outputIndex,
      protocol: 'basket insertion',
      insertionRemittance: {
        basket: 'titles',
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: notice.keyID,
          counterparty: notice.sender,
          titleId: notice.titleId,
          dump: notice.dump ?? ''
        }),
        tags: ['titles', 'transfer', notice.titleId]
      }
    }],
    description: 'Accept a title'
  })
}
