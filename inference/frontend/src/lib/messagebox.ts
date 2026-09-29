import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/inference'

export interface ResponseNotice {
  kind: 'response'
  offerId: string
  requestHash: string
  responseHash: string
  response: string
  timestamp: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

function asNotice(body: unknown): ResponseNotice | null {
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
    row.kind === 'response'
    && typeof row.offerId === 'string'
    && typeof row.requestHash === 'string'
    && typeof row.responseHash === 'string'
    && typeof row.response === 'string'
    && typeof row.timestamp === 'string'
  ) {
    return {
      kind: 'response',
      offerId: row.offerId,
      requestHash: row.requestHash,
      responseHash: row.responseHash,
      response: row.response,
      timestamp: row.timestamp
    }
  }
  return null
}

export async function sendResponse(
  wallet: WalletClient,
  recipient: string,
  notice: Omit<ResponseNotice, 'kind'>
): Promise<void> {
  const key = recipient.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body: { kind: 'response', ...notice }
    }, MESSAGE_BOX_HOST)
  } catch {
    // The payer still holds the response in this session. Overlay never gets the plaintext.
  }
}

export async function pullResponse(
  wallet: WalletClient,
  responseHash: string
): Promise<ResponseNotice | null> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    for (const message of messages) {
      const row = asNotice(message.body)
      if (row && row.responseHash === responseHash) return row
    }
    return null
  } catch {
    return null
  }
}
