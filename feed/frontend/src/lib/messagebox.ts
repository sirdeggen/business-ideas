import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import {
  MESSAGE_BOX,
  MESSAGE_BOX_HOST,
  isMetricType,
  type MetricType
} from '../../../protocol/feed'

export interface DeliveryNotice {
  kind: 'delivery'
  feedId: string
  label: string
  metricType: MetricType
  value: string
  unit: string
  valueHash: string
  timestamp: string
}

export interface QueryNotice {
  kind: 'query'
  feedId: string
  buyer: string
  payTxid: string
}

export type FeedNotice = DeliveryNotice | QueryNotice

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

function asNotice(body: unknown): FeedNotice | null {
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
    row.kind === 'delivery'
    && typeof row.feedId === 'string'
    && typeof row.label === 'string'
    && typeof row.metricType === 'string'
    && isMetricType(row.metricType)
    && typeof row.value === 'string'
    && typeof row.unit === 'string'
    && typeof row.valueHash === 'string'
    && typeof row.timestamp === 'string'
  ) {
    return {
      kind: 'delivery',
      feedId: row.feedId,
      label: row.label,
      metricType: row.metricType,
      value: row.value,
      unit: row.unit,
      valueHash: row.valueHash,
      timestamp: row.timestamp
    }
  }
  if (
    row.kind === 'query'
    && typeof row.feedId === 'string'
    && typeof row.buyer === 'string'
    && typeof row.payTxid === 'string'
  ) {
    return {
      kind: 'query',
      feedId: row.feedId,
      buyer: row.buyer,
      payTxid: row.payTxid
    }
  }
  return null
}

async function send(wallet: WalletClient, recipient: string, body: FeedNotice): Promise<void> {
  const key = recipient.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body
    }, MESSAGE_BOX_HOST)
  } catch {
    // Basket still holds the publisher’s reading. Overlay catalog never gets it.
  }
}

export async function sendDelivery(
  wallet: WalletClient,
  recipient: string,
  notice: Omit<DeliveryNotice, 'kind'>
): Promise<void> {
  await send(wallet, recipient, { kind: 'delivery', ...notice })
}

export async function sendQuery(
  wallet: WalletClient,
  publisher: string,
  feedId: string,
  buyer: string,
  payTxid: string
): Promise<void> {
  await send(wallet, publisher, { kind: 'query', feedId, buyer, payTxid })
}

export async function pullNotices(wallet: WalletClient): Promise<FeedNotice[]> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    const parsed: FeedNotice[] = []
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

export async function pullDelivery(
  wallet: WalletClient,
  feedId: string,
  valueHash: string
): Promise<DeliveryNotice | null> {
  const notices = await pullNotices(wallet)
  const match = notices.find((item) => (
    item.kind === 'delivery' && item.feedId === feedId && item.valueHash === valueHash
  ))
  return match && match.kind === 'delivery' ? match : null
}
