const SATS_PER_BSV = 100_000_000

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Rate HTTP ${response.status}`)
  return response.json()
}

export async function fetchUsdPerBsv(): Promise<number> {
  try {
    const data = await readJson('https://api.whatsonchain.com/v1/bsv/main/exchangerate') as {
      rate?: string | number
    }
    const rate = Number(data.rate)
    if (Number.isFinite(rate) && rate > 0) return rate
  } catch {
    // Fall through to CoinGecko.
  }

  try {
    const data = await readJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash-sv&vs_currencies=usd'
    ) as { 'bitcoin-cash-sv'?: { usd?: number } }
    const rate = Number(data['bitcoin-cash-sv']?.usd)
    if (Number.isFinite(rate) && rate > 0) return rate
  } catch {
    // No invented price.
  }

  throw new Error('Could not fetch a dollar rate')
}

export function satsToUsd(sats: number, usdPerBsv: number): string {
  if (!(usdPerBsv > 0) || !Number.isFinite(sats) || sats <= 0) return ''
  const usd = (sats / SATS_PER_BSV) * usdPerBsv
  if (!(usd > 0)) return ''
  const formatted = usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  // A v0 sat fee often rounds to $0.00. Do not put that on the face.
  if (formatted === '$0.00') return ''
  return formatted
}

export function priceFace(sats: number, usdPerBsv: number | null): string {
  if (usdPerBsv == null) return ''
  return satsToUsd(sats, usdPerBsv)
}
