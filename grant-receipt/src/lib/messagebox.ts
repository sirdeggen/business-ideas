import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import {
  MESSAGE_BOX,
  MESSAGE_BOX_HOST,
  parseDeskMessage,
  type DeskMessage
} from './protocol'

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

export async function sendDeskMessage(
  wallet: WalletClient,
  recipient: string,
  body: DeskMessage
): Promise<void> {
  const client = messageBoxClient(wallet)
  await client.sendMessage({
    recipient,
    messageBox: MESSAGE_BOX,
    body
  }, MESSAGE_BOX_HOST)
}

export async function pullDeskMessages(wallet: WalletClient): Promise<DeskMessage[]> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    const parsed: DeskMessage[] = []
    const ids: string[] = []
    for (const message of messages) {
      const body = typeof message.body === 'string'
        ? JSON.parse(message.body) as unknown
        : message.body
      const row = parseDeskMessage(body)
      if (!row) continue
      parsed.push(row)
      ids.push(String(message.messageId))
    }
    if (ids.length > 0) {
      try {
        await client.acknowledgeMessage({ messageIds: ids, host: MESSAGE_BOX_HOST })
      } catch {
        // Local persist already has them.
      }
    }
    return parsed
  } catch {
    return []
  }
}
