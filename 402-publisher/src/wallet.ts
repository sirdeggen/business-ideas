import { createRequire } from 'node:module'
import type { WalletInterface } from '@bsv/sdk' with { 'resolution-mode': 'require' }
import {
  Services,
  StorageClient,
  Wallet,
  WalletSigner,
  WalletStorageManager
} from '@bsv/wallet-toolbox'

// wallet-toolbox is CJS. Load the matching @bsv/sdk condition so KeyDeriver /
// PrivateKey share one runtime identity (ESM + CJS copies break private fields).
type CommonJsSdk = typeof import('@bsv/sdk', { with: { 'resolution-mode': 'require' } })
const { KeyDeriver, PrivateKey } = createRequire(import.meta.url)('@bsv/sdk') as CommonJsSdk

export const DEFAULT_STORAGE_URL = 'https://store-us-1.bsvb.tech'

export type Chain = 'main' | 'test'

let walletInstance: { wallet: WalletInterface; identityKey: string } | null = null

function readPrivateKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.PRIVATE_KEY?.trim()
  if (!key) {
    throw new Error('PRIVATE_KEY environment variable is required')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key) || /^0{64}$/.test(key)) {
    throw new Error('PRIVATE_KEY must be 32-byte hex (64 characters)')
  }
  return key
}

export function readChain(env: NodeJS.ProcessEnv = process.env): Chain {
  const chain = env.CHAIN || 'main'
  if (chain !== 'main' && chain !== 'test') {
    throw new Error(`CHAIN must be "main" or "test", got ${chain}`)
  }
  return chain
}

export function readStorageUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.STORAGE_URL || DEFAULT_STORAGE_URL
}

/** Identity key is local to the private key — no storage round-trip needed for 402 challenges. */
export function identityKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const keyDeriver = new KeyDeriver(new PrivateKey(readPrivateKey(env), 'hex'))
  return keyDeriver.identityKey
}

export async function makeWallet(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ wallet: WalletInterface; identityKey: string }> {
  if (walletInstance) return walletInstance

  const privateKey = readPrivateKey(env)
  const chain = readChain(env)
  const storageUrl = readStorageUrl(env)

  console.log(`Initializing ${chain} wallet against ${storageUrl}...`)

  const keyDeriver = new KeyDeriver(new PrivateKey(privateKey, 'hex'))
  const storageManager = new WalletStorageManager(keyDeriver.identityKey)
  const signer = new WalletSigner(chain, keyDeriver, storageManager)
  const services = new Services(chain)
  const wallet = new Wallet(signer, services)
  const client = new StorageClient(wallet, storageUrl)

  await client.makeAvailable()
  await storageManager.addWalletStorageProvider(client)

  walletInstance = { wallet, identityKey: keyDeriver.identityKey }
  console.log('Wallet initialized. Identity key:', keyDeriver.identityKey)
  return walletInstance
}

export function getWallet(): { wallet: WalletInterface; identityKey: string } | null {
  return walletInstance
}

/** Test-only: drop the cached toolbox wallet. */
export function resetWalletCache(): void {
  walletInstance = null
}
