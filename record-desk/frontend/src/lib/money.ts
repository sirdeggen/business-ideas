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

export function satsToUsd(sats: number, usdPerBsv: number): number {
  if (!(usdPerBsv > 0)) throw new Error('Could not fetch a dollar rate')
  return (sats / SATS_PER_BSV) * usdPerBsv
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Hide $0.00 / $0.01 pennies. Sats are the settlement. */
export function formatMeaningfulUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return ''
  if (Math.round(amount * 100) <= 1) return ''
  return formatUsd(amount)
}

export function formatSats(sats: number): string {
  if (!Number.isFinite(sats)) return ''
  const n = Math.trunc(sats)
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'sat' : 'sats'}`
}

/** USD next to sats only when a real rate exists and it is more than a penny. */
export function formatSatsUsd(sats: number, usdPerBsv: number | null): string {
  if (!usdPerBsv || usdPerBsv <= 0 || !Number.isFinite(sats) || sats < 0) return ''
  return formatMeaningfulUsd((sats / SATS_PER_BSV) * usdPerBsv)
}

/** Lead with sats. Never append ($0.00) or ($0.01). */
export function formatSatsAmount(sats: number, usdPerBsv: number | null = null): string {
  const label = formatSats(sats)
  const usd = formatSatsUsd(sats, usdPerBsv)
  return usd ? `${label} (${usd})` : label
}
