import { accrue, satsToUsd, type StreamStatus } from '../../../protocol/stream'
import { formatSats, formatUsd } from './money'
import type { OverlayStream } from './overlay'

function optionalUsd(sats: number, stream: OverlayStream): string {
  const usd = satsToUsd(sats, stream.amountSats, stream.amountUsd)
  return usd > 0 ? ` · ${formatUsd(usd)}` : ''
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
  return `${formatSats(stream.amountSats)}${optionalUsd(stream.amountSats, stream)}`
}

export function displaySats(sats: number, stream: OverlayStream): string {
  return `${formatSats(sats)}${optionalUsd(sats, stream)}`
}

export function dailyRate(stream: OverlayStream): string {
  const days = stream.durationSec / 86_400
  if (!(days > 0)) return ''
  const sats = Math.floor(stream.amountSats / days)
  if (!(sats > 0)) return ''
  return `${formatSats(sats)}${optionalUsd(sats, stream)}`
}

export function dayPhrase(stream: OverlayStream, nowMs = Date.now()): string {
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
  return `${displaySats(math.earnedSats, stream)} accrued · ${displaySats(stream.claimedSats, stream)} claimed`
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
