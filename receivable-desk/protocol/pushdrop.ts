/**
 * Wallet-free PushDrop (BRC-48) lock, matching @bsv/sdk PushDrop.lock
 * with includeSignature=false and lockPosition='before'.
 *
 * Apps still lock through a BRC-100 wallet. Tests and the local seed use this
 * so the on-chain script shape is real PushDrop, not a pretend table.
 */
import { LockingScript, OP, Utils } from '@bsv/sdk'

function createMinimallyEncodedScriptChunk(
  data: number[]
): { op: number, data?: number[] } {
  if (data.length === 0) return { op: 0 }
  if (data.length === 1 && data[0] === 0) return { op: 0 }
  if (data.length === 1 && data[0] > 0 && data[0] <= 16) return { op: 0x50 + data[0] }
  if (data.length === 1 && data[0] === 0x81) return { op: 0x4f }
  if (data.length <= 75) return { op: data.length, data }
  if (data.length <= 255) return { op: 0x4c, data }
  if (data.length <= 65535) return { op: 0x4d, data }
  return { op: 0x4e, data }
}

export function lockPushDrop(fields: number[][], lockingPublicKeyHex: string): LockingScript {
  const pubkey = Utils.toArray(lockingPublicKeyHex, 'hex')
  const lockChunks: Array<{ op: number, data?: number[] }> = [
    { op: pubkey.length, data: pubkey },
    { op: OP.OP_CHECKSIG }
  ]
  const pushDropChunks: Array<{ op: number, data?: number[] }> = []
  for (const field of fields) {
    pushDropChunks.push(createMinimallyEncodedScriptChunk(field))
  }
  let notYetDropped = fields.length
  while (notYetDropped > 1) {
    pushDropChunks.push({ op: OP.OP_2DROP })
    notYetDropped -= 2
  }
  if (notYetDropped !== 0) {
    pushDropChunks.push({ op: OP.OP_DROP })
  }
  return new LockingScript([...lockChunks, ...pushDropChunks])
}
