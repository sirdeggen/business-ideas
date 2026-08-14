import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import {
  MESSAGE_BOX,
  MESSAGE_BOX_HOST,
  type BoardEvent,
  type Treasury
} from '../../../protocol/events'

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

function otherSigners(treasury: Treasury, self: string): string[] {
  const me = self.toLowerCase()
  return treasury.signers
    .map((signer) => signer.identityKey)
    .filter((key) => key && key.toLowerCase() !== me)
}

export async function notifySigners(
  wallet: WalletClient,
  treasury: Treasury,
  selfIdentityKey: string,
  event: BoardEvent
): Promise<void> {
  const recipients = otherSigners(treasury, selfIdentityKey)
  if (recipients.length === 0) return
  const client = messageBoxClient(wallet)
  await Promise.all(recipients.map(async (recipient) => {
    try {
      await client.sendMessage({
        recipient,
        messageBox: MESSAGE_BOX,
        body: event
      }, MESSAGE_BOX_HOST)
    } catch {
      // Overlay remains the public source of truth.
    }
  }))
}

export async function pullSignerMessages(wallet: WalletClient): Promise<BoardEvent[]> {
  try {
    const client = messageBoxClient(wallet)
    const messages = await client.listMessages({
      messageBox: MESSAGE_BOX,
      host: MESSAGE_BOX_HOST
    })
    const events: BoardEvent[] = []
    const ids: string[] = []
    for (const message of messages) {
      const body = typeof message.body === 'string'
        ? JSON.parse(message.body) as BoardEvent
        : message.body as BoardEvent
      if (body?.treasuryId && body.kind && body.payload) {
        events.push(body)
        ids.push(String(message.messageId))
      }
    }
    if (ids.length > 0) {
      try {
        await client.acknowledgeMessage({ messageIds: ids, host: MESSAGE_BOX_HOST })
      } catch {
        // Leaving them unread is fine; overlay already has the minutes.
      }
    }
    return events
  } catch {
    return []
  }
}
