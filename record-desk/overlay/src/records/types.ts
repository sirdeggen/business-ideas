import type { RecordPayload } from '../../../protocol/record'

export interface RecordDoc extends RecordPayload {
  txid: string
  outputIndex: number
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface RecordQuery {
  outpoint?: string
  hash?: string
  limit?: number
  skip?: number
}
