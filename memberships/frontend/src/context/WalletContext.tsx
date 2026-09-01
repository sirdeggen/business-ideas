import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WalletClient } from '@bsv/sdk'
import { connectWallet } from '../lib/wallet'
import { errorMessage, isWalletMissing } from '../lib/config'

export interface ConnectedWallet {
  wallet: WalletClient
  identityKey: string
}

interface WalletState {
  wallet: WalletClient | null
  identityKey: string | null
  connecting: boolean
  error: string | null
  walletMissing: boolean
  connect: () => Promise<ConnectedWallet | null>
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null)
  const [identityKey, setIdentityKey] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletMissing, setWalletMissing] = useState(false)

  const connect = async (): Promise<ConnectedWallet | null> => {
    if (wallet && identityKey) return { wallet, identityKey }
    setConnecting(true)
    setError(null)
    setWalletMissing(false)
    try {
      const result = await connectWallet()
      setWallet(result.wallet)
      setIdentityKey(result.identityKey)
      return result
    } catch (err) {
      console.error('Wallet connect failed', err)
      setError(errorMessage(err))
      setWalletMissing(isWalletMissing(err))
      setWallet(null)
      setIdentityKey(null)
      return null
    } finally {
      setConnecting(false)
    }
  }

  return (
    <WalletContext.Provider value={{ wallet, identityKey, connecting, error, walletMissing, connect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}
