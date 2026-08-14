import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Role } from '../../protocol/treasury.js'

export interface Signer {
  role: Role
  identityKey: string
  derivedPubkey?: string
  joinedAt?: string
}

export interface VaultUtxo {
  txid: string
  vout: number
  satoshis: number
  beef: number[]
}

export interface Approval {
  identityKey: string
  role: Role
  derivedPubkey: string
  signature: number[]
  at: string
}

export interface P2msSig {
  identityKey: string
  role: Role
  derivedPubkey: string
  signature: number[]
  at: string
}

export interface Proposal {
  id: string
  amountSats: number
  payeeIdentityKey: string
  memo: string
  payeeLockingScriptHex: string
  vaultTxid: string
  vaultVout: number
  vaultSatoshis: number
  feeSats: number
  changeSats: number
  createdAt: string
  createdBy: string
  approvals: Approval[]
  p2msSigs: P2msSig[]
  status: 'open' | 'approved' | 'paid'
  txid?: string
}

export type FeedKind =
  | 'created'
  | 'joined'
  | 'vault_ready'
  | 'funded'
  | 'proposed'
  | 'approved'
  | 'paid'

export interface FeedEvent {
  id: string
  at: string
  kind: FeedKind
  text: string
}

export interface Treasury {
  id: string
  name: string
  threshold: number
  signers: Signer[]
  lockingScriptHex?: string
  vault: VaultUtxo[]
  proposals: Proposal[]
  feed: FeedEvent[]
  createdAt: string
}

export interface StoreData {
  treasuries: Treasury[]
}

export class JsonStore {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async read(): Promise<StoreData> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as StoreData
      if (!Array.isArray(parsed.treasuries)) return { treasuries: [] }
      return parsed
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { treasuries: [] }
      throw error
    }
  }

  async update<T>(mutator: (data: StoreData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read()
      const result = await mutator(data)
      await mkdir(path.dirname(this.filePath), { recursive: true })
      await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      return result
    })
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }
}
