import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST, sampleHashOf } from '../../../protocol/dataset'

export interface FileNotice {
  kind: 'file'
  listingId: string
  dump: string
  sampleHash: string
}

export interface PurchaseNotice {
  kind: 'purchase'
  listingId: string
  buyer: string
  payTxid: string
}

export type DatasetNotice = FileNotice | PurchaseNotice

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

function asNotice(body: unknown): DatasetNotice | null {
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
  if (row.kind === 'file' && typeof row.listingId === 'string' && typeof row.dump === 'string') {
    const sampleHash = typeof row.sampleHash === 'string' ? row.sampleHash : sampleHashOf(row.dump)
    return { kind: 'file', listingId: row.listingId, dump: row.dump, sampleHash }
  }
  if (
    row.kind === 'purchase'
    && typeof row.listingId === 'string'
    && typeof row.buyer === 'string'
    && typeof row.payTxid === 'string'
  ) {
    return {
      kind: 'purchase',
      listingId: row.listingId,
      buyer: row.buyer,
      payTxid: row.payTxid
    }
  }
  return null
}

export async function sendFile(
  wallet: WalletClient,
  recipient: string,
  listingId: string,
  dump: string,
  sampleHash: string
): Promise<void> {
  const key = recipient.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body: { kind: 'file', listingId, dump, sampleHash } satisfies FileNotice
    }, MESSAGE_BOX_HOST)
  } catch {
    // Basket still holds the seller’s file. Overlay never gets the dump.
  }
}

export async function sendPurchase(
  wallet: WalletClient,
  seller: string,
  listingId: string,
  buyer: string,
  payTxid: string
): Promise<void> {
  const key = seller.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body: { kind: 'purchase', listingId, buyer, payTxid } satisfies PurchaseNotice
    }, MESSAGE_BOX_HOST)
  } catch {
    // Pay already happened. Seller can still send the file later.
  }
}

export async function pullNotices(wallet: WalletClient): Promise<DatasetNotice[]> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    const parsed: DatasetNotice[] = []
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

export async function pullFile(
  wallet: WalletClient,
  listingId: string
): Promise<string | null> {
  const notices = await pullNotices(wallet)
  const file = notices.find((item) => item.kind === 'file' && item.listingId === listingId)
  return file && file.kind === 'file' ? file.dump : null
}
