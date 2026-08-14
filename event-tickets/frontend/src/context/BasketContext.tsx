import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { inspectHeldBaskets, type BasketInspection, type HeldTicket } from '../lib/actions'
import { formatBasketDiagnostic } from '../lib/basket'
import { errorMessage } from '../lib/config'
import { useWallet } from './WalletContext'

interface BasketState {
  tickets: HeldTicket[]
  inspection: BasketInspection | null
  diagnostic: string
  error: string | null
  refresh: () => Promise<void>
}

const BasketContext = createContext<BasketState | undefined>(undefined)

export function BasketProvider({ children }: { children: ReactNode }) {
  const { wallet } = useWallet()
  const [inspection, setInspection] = useState<BasketInspection | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!wallet) {
      setInspection(null)
      setError(null)
      return
    }
    try {
      const next = await inspectHeldBaskets(wallet)
      setInspection(next)
      const listedEmpty = next.primary.listed === 0 && next.legacy.listed === 0
      if (!listedEmpty && next.tickets.length === 0) {
        setError(formatBasketDiagnostic(next) || 'Basket list returned outputs that did not parse')
      } else {
        setError(null)
      }
    } catch (err) {
      console.error('Basket refresh failed', err)
      setError(errorMessage(err))
    }
  }, [wallet])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const diagnostic = inspection ? formatBasketDiagnostic(inspection) : ''

  return (
    <BasketContext.Provider value={{
      tickets: inspection?.tickets ?? [],
      inspection,
      diagnostic,
      error,
      refresh
    }}>
      {children}
    </BasketContext.Provider>
  )
}

export function useBasket(): BasketState {
  const context = useContext(BasketContext)
  if (!context) throw new Error('useBasket must be used within BasketProvider')
  return context
}
