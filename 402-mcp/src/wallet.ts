import { ServerWallet } from '@bsv/simple/server'
import type { WalletInterface } from '@bsv/sdk'
import { CHAIN, SERVER_PRIVATE_KEY, STORAGE_URL } from './config.js'

export interface ServerWalletHandle {
  wallet: WalletInterface
  identityKey: string
}

let cached: ServerWalletHandle | null = null

/**
 * Receive-side wallet for BRC-121 internalization.
 *
 * Confirmed against @bsv/simple source: ServerWallet.create wraps the same
 * wallet-toolbox Wallet + StorageClient pattern as 402-articles. Types on
 * ServerWalletConfig say network is 'main' | 'testnet', but WalletSigner
 * takes wallet-toolbox Chain ('main' | 'test'). We pass CHAIN through so
 * the signer matches 402-articles.
 */
export async function getServerWallet(): Promise<ServerWalletHandle> {
  if (cached) return cached

  if (!/^[0-9a-fA-F]{64}$/.test(SERVER_PRIVATE_KEY)) {
    throw new Error('SERVER_PRIVATE_KEY must be a 64-character hex private key')
  }

  const server = await ServerWallet.create({
    privateKey: SERVER_PRIVATE_KEY,
    // wallet-toolbox Chain is 'main' | 'test'; simple's published type says 'testnet'
    network: CHAIN as unknown as 'main',
    storageUrl: STORAGE_URL
  })

  cached = {
    wallet: server.getClient(),
    identityKey: server.getIdentityKey()
  }
  return cached
}
