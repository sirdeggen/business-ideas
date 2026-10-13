import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/bounty'

export interface ReportEnvelope {
  bountyId: string
  reportHash: string
  reportBody: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

/** Private report. The public book only ever carries the hash. */
export async function sendReport(
  wallet: WalletClient,
  selfIdentityKey: string,
  recipient: string,
  body: ReportEnvelope
): Promise<void> {
  if (!body.reportBody.trim()) return
  if (!recipient || recipient.toLowerCase() === selfIdentityKey.toLowerCase()) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient,
      messageBox: MESSAGE_BOX,
      body
    }, MESSAGE_BOX_HOST)
  } catch {
    // Overlay is the public source of truth. The body stays off the chain.
  }
}
