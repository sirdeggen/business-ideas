import { WalletClient } from '@bsv/sdk'
import { createWallet } from '@bsv/simple/browser'
import { originator } from './config'

export const CONNECT_MS = 8000

export const CONNECT_TIMEOUT_MESSAGE =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry, with Desktop unlocked.'

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function connectWalletInner(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const pageOriginator = originator()
  try {
    const simple = await createWallet()
    const wallet = simple.getClient() as WalletClient
    return { wallet, identityKey: simple.getIdentityKey() }
  } catch {
    const wallet = new WalletClient('auto', pageOriginator)
    const { publicKey } = await wallet.getPublicKey({ identityKey: true })
    return { wallet, identityKey: publicKey }
  }
}

export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  return withTimeout(connectWalletInner(), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
}
