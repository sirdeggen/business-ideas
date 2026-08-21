import { accrue, satsToUsd, type StreamStatus } from '../../../protocol/stream'
import { formatSats, formatStreamUsd, formatUsd } from './money'
import type { OverlayStream } from './overlay'

export const STREAM_CARD = 'Stream'
export const RECEIPT_CARD = 'Receipt'

/** Documented display of the default 100,000 sat pot. Settlement is still sats. */
export const GHOST_AMOUNT_USD = '0.07'
export const GHOST_MEMO = 'Legal research week'

export const FREEZE_HINT =
  'Only the person who opened this stream can freeze it. That stops new pay from accruing. Already-accrued can still be claimed.'

export const CLOCK_STOPPED =
  'The clock is stopped. Already-accrued can still be claimed. The remaining pot does not earn.'

export function remainingPotSats(stream: OverlayStream): number {
  const accounted = Math.max(0, stream.amountSats - stream.claimedSats)
  if (stream.claimedSats > 0) return accounted
  const onChain = Number(stream.satoshis)
  if (Number.isInteger(onChain) && onChain > 1) return onChain
  return accounted
}

function hasUsdSnapshot(stream: Pick<OverlayStream, 'amountSats' | 'amountUsd'>): boolean {
  const usd = Number(stream.amountUsd)
  return stream.amountSats > 0 && Number.isFinite(usd) && usd >= 0 && String(stream.amountUsd).trim() !== ''
}

export function displayMoney(
  sats: number,
  stream: Pick<OverlayStream, 'amountSats' | 'amountUsd'>
): string {
  if (!hasUsdSnapshot(stream)) return formatSats(sats)
  const usd = satsToUsd(sats, stream.amountSats, stream.amountUsd)
  if (sats === 0) return formatUsd(0)
  return formatStreamUsd(usd) || formatUsd(0)
}

export function remainingLine(stream: OverlayStream): string {
  return `${displayMoney(remainingPotSats(stream), stream)} remaining`
}

export function claimLabel(
  claimableSats: number,
  stream?: Pick<OverlayStream, 'amountSats' | 'amountUsd'>
): string {
  if (claimableSats < 1) return 'Nothing to claim yet'
  if (stream) return `Claim ${displayMoney(claimableSats, stream)}`
  return `Claim ${formatSats(claimableSats)}`
}

export function humanReceiptId(streamId: string): string {
  const compact = streamId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase()
  if (compact.length < 8) return 'SP-0000-0000'
  return `SP-${compact.slice(0, 4)}-${compact.slice(4, 8)}`
}

export function formatWhen(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function statusLabel(status: StreamStatus): string {
  if (status === 'frozen') return 'Frozen'
  if (status === 'finished') return 'Finished'
  return 'Open'
}

export function displayAmount(stream: OverlayStream): string {
  if (hasUsdSnapshot(stream)) return formatUsd(stream.amountUsd)
  return formatSats(stream.amountSats)
}

export function displaySats(sats: number): string {
  return formatSats(sats)
}

export function dailyRate(stream: Pick<OverlayStream, 'amountSats' | 'amountUsd' | 'durationSec'>): string {
  const days = stream.durationSec / 86_400
  if (!(days > 0)) return ''
  if (hasUsdSnapshot(stream)) {
    const usd = Number(stream.amountUsd) / days
    return formatStreamUsd(usd)
  }
  const sats = Math.floor(stream.amountSats / days)
  if (!(sats > 0)) return ''
  return formatSats(sats)
}

export function dayPhrase(
  stream: Pick<
    OverlayStream,
    'startIso' | 'durationSec' | 'amountSats' | 'frozen' | 'claimedSats' | 'freezeIso' | 'rateSatsPerSec'
  >,
  nowMs = Date.now()
): string {
  const math = accrue(stream, nowMs)
  const day = Math.min(
    Math.max(1, Math.ceil(math.elapsedSec / 86_400)),
    Math.max(1, Math.round(stream.durationSec / 86_400))
  )
  const total = Math.max(1, Math.round(stream.durationSec / 86_400))
  if (math.elapsedSec <= 0) return `Starts ${formatWhen(stream.startIso)}`
  if (math.status === 'finished') return `Finished · ${total} days`
  if (math.status === 'frozen') return `Frozen on day ${day} of ${total}`
  return `Day ${day} of ${total}`
}

export function accruedLine(stream: OverlayStream, nowMs = Date.now()): string {
  const math = accrue(stream, nowMs)
  return `${displayMoney(math.earnedSats, stream)} accrued · ${displayMoney(stream.claimedSats, stream)} claimed · ${remainingLine(stream)}`
}

export function padLocal(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${padLocal(d.getMonth() + 1)}-${padLocal(d.getDate())}T${padLocal(d.getHours())}:${padLocal(d.getMinutes())}`
}

export function defaultStartLocal(): string {
  return toDatetimeLocal(Date.now() - 3 * 86_400_000)
}

export function datetimeLocalToIso(value: string): string {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) throw new Error('Start must be a date and time')
  return new Date(ms).toISOString()
}
