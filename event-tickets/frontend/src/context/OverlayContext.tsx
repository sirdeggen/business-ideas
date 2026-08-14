import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { OVERLAY_STORAGE_KEY, resolveOverlayUrl } from '../lib/config'
import { pingOverlay } from '../lib/overlay'

interface OverlayState {
  url: string
  setUrl: (url: string) => void
  online: boolean | null
  refresh: () => Promise<void>
}

const OverlayContext = createContext<OverlayState | undefined>(undefined)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [url, setUrlState] = useState(() => resolveOverlayUrl())
  const [online, setOnline] = useState<boolean | null>(null)

  const setUrl = (next: string): void => {
    setUrlState(next)
    localStorage.setItem(OVERLAY_STORAGE_KEY, next)
  }

  const refresh = async (): Promise<void> => {
    setOnline(await pingOverlay(url))
  }

  useEffect(() => {
    void refresh()
  }, [url])

  return (
    <OverlayContext.Provider value={{ url, setUrl, online, refresh }}>
      {children}
    </OverlayContext.Provider>
  )
}

export function useOverlay(): OverlayState {
  const context = useContext(OverlayContext)
  if (!context) throw new Error('useOverlay must be used within OverlayProvider')
  return context
}
