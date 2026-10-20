import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/capture'

export interface PreviewEnvelope {
  requestId: string
  receiptHash: string
  preview: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

/** Watermarked preview only. The raw file never enters this envelope. */
export async function sendPreview(
  wallet: WalletClient,
  selfIdentityKey: string,
  recipient: string,
  body: PreviewEnvelope
): Promise<void> {
  if (!body.preview.trim()) return
  if (!recipient || recipient.toLowerCase() === selfIdentityKey.toLowerCase()) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient,
      messageBox: MESSAGE_BOX,
      body
    }, MESSAGE_BOX_HOST)
  } catch {
    // The public book carries the receipt. The preview stays off the chain.
  }
}
