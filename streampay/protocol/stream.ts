/**
 * StreamPay protocol (PushDrop / BRC-48 fields).
 *
 * A stream is a 1-sat PushDrop snapshot on tm_anytx / ls_anytx. Accrual is
 * client math (not nLockTime). Claim and freeze persist by emitting a new
 * snapshot — the invoices pay pattern that overlay-us-1 actually admits.
 * Field 0 is the tag `streampay`. ls_anytx has no tag filter; clients filter.
 */

export const PROTOCOL_ID: [0, string] = [0, 'streampay']
export const BASKET = 'streampay'
export const TAG = 'streampay'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']

export const MAX_MEMO_CHARS = 200
export const MAX_NAME_CHARS = 80
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000
export const DEFAULT_DURATION_DAYS = 14
export const DEFAULT_AMOUNT_USD = '400.00'

export type StreamStatus = 'open' | 'frozen' | 'finished'

export interface StreamPayload {
  tag: typeof TAG
  streamId: string
  org: string
  contractorName: string
  contractorIdentity: string
  treasurerIdentity: string
  amountSats: number
  rateSatsPerSec: number
  startIso: string
  durationSec: number
  frozen: boolean
  claimedSats: number
  freezeIso: string
  amountUsd: string
  memo: string
  updatedIso: string
  lastClaimSats: number
  lastClaimIso: string
}

export interface StreamExtras {
  amountUsd?: unknown
  memo?: unknown
  updatedIso?: unknown
  lastClaimSats?: unknown
  lastClaimIso?: unknown
  rateSatsPerSec?: unknown
}

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function isIdentityKey(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

export function isStreamId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function isIsoTimestamp(value: string): boolean {
  if (!value) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString().length >= 20
}

export function newStreamId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Amount must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertMemo(memo: string): void {
  if (memo.length > MAX_MEMO_CHARS) {
    throw new Error(`What it’s for must be at most ${MAX_MEMO_CHARS} characters`)
  }
}

export function assertName(label: string, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  if (trimmed.length > MAX_NAME_CHARS) {
    throw new Error(`${label} must be at most ${MAX_NAME_CHARS} characters`)
  }
}

export function rateSatsPerSec(amountSats: number, durationSec: number): number {
  if (!(durationSec > 0)) return 0
  return amountSats / durationSec
}

export interface Accrual {
  startMs: number
  endMs: number
  freezeMs: number | null
  elapsedSec: number
  earnedSats: number
  claimableSats: number
  status: StreamStatus
}

export function accrue(
  stream: Pick<StreamPayload, 'amountSats' | 'startIso' | 'durationSec' | 'frozen' | 'claimedSats' | 'freezeIso' | 'rateSatsPerSec'>,
  nowMs = Date.now()
): Accrual {
  const startMs = Date.parse(stream.startIso)
  const safeStart = Number.isFinite(startMs) ? startMs : nowMs
  const durationSec = stream.durationSec > 0 ? stream.durationSec : 0
  const endMs = safeStart + durationSec * 1000
  const freezeMs = stream.frozen && stream.freezeIso
    ? Date.parse(stream.freezeIso)
    : null
  const freezeCap = freezeMs != null && Number.isFinite(freezeMs) ? freezeMs : Number.POSITIVE_INFINITY
  const capMs = Math.min(endMs, freezeCap)
  const elapsedSec = Math.max(0, (Math.min(nowMs, capMs) - safeStart) / 1000)
  const rate = stream.rateSatsPerSec > 0
    ? stream.rateSatsPerSec
    : rateSatsPerSec(stream.amountSats, durationSec)
  const earnedSats = Math.min(stream.amountSats, Math.floor(rate * elapsedSec))
  const claimableSats = Math.max(0, earnedSats - stream.claimedSats)
  let status: StreamStatus = 'open'
  if (stream.frozen) status = 'frozen'
  else if (nowMs >= endMs) status = 'finished'
  return { startMs: safeStart, endMs, freezeMs: Number.isFinite(freezeMs) ? freezeMs : null, elapsedSec, earnedSats, claimableSats, status }
}

export function encodeStreamFields(stream: Omit<StreamPayload, 'tag' | 'rateSatsPerSec'> & { rateSatsPerSec?: number }): number[][] {
  assertAmountSats(stream.amountSats)
  assertMemo(stream.memo)
  assertName('Organization name', stream.org)
  assertName('Contractor name', stream.contractorName)
  if (!isStreamId(stream.streamId)) throw new Error('streamId must be 16 bytes hex')
  if (!isIdentityKey(stream.treasurerIdentity)) {
    throw new Error('treasurerIdentity must be a 66-hex compressed key')
  }
  if (stream.contractorIdentity && !isIdentityKey(stream.contractorIdentity)) {
    throw new Error('contractorIdentity must be a 66-hex compressed key')
  }
  if (!isIsoTimestamp(stream.startIso)) throw new Error('start must be a date and time')
  if (!Number.isInteger(stream.durationSec) || stream.durationSec < 1) {
    throw new Error('Duration must be at least one second')
  }
  if (!Number.isInteger(stream.claimedSats) || stream.claimedSats < 0) {
    throw new Error('claimedSats must be a non-negative integer')
  }
  if (!Number.isInteger(stream.lastClaimSats) || stream.lastClaimSats < 0) {
    throw new Error('lastClaimSats must be a non-negative integer')
  }
  const rate = stream.rateSatsPerSec ?? rateSatsPerSec(stream.amountSats, stream.durationSec)
  const extras: StreamExtras = {
    amountUsd: stream.amountUsd.trim(),
    memo: stream.memo.trim(),
    updatedIso: stream.updatedIso,
    lastClaimSats: stream.lastClaimSats,
    lastClaimIso: stream.lastClaimIso,
    rateSatsPerSec: rate
  }
  return [
    stringToUtf8Bytes(TAG),
    stringToUtf8Bytes(stream.streamId),
    stringToUtf8Bytes(stream.org.trim()),
    stringToUtf8Bytes(stream.contractorName.trim()),
    stringToUtf8Bytes(stream.contractorIdentity.trim()),
    stringToUtf8Bytes(stream.treasurerIdentity.trim()),
    stringToUtf8Bytes(String(stream.amountSats)),
    stringToUtf8Bytes(stream.startIso),
    stringToUtf8Bytes(String(stream.durationSec)),
    stringToUtf8Bytes(stream.frozen ? '1' : ''),
    stringToUtf8Bytes(String(stream.claimedSats)),
    stringToUtf8Bytes(stream.freezeIso || ''),
    stringToUtf8Bytes(JSON.stringify(extras))
  ]
}

function asBytes(field: number[] | Uint8Array): number[] {
  return Array.from(field)
}

function parseExtras(raw: string): Pick<StreamPayload, 'amountUsd' | 'memo' | 'updatedIso' | 'lastClaimSats' | 'lastClaimIso' | 'rateSatsPerSec'> {
  try {
    const parsed = JSON.parse(raw) as StreamExtras
    const lastClaimSats = Number(parsed.lastClaimSats)
    const rate = Number(parsed.rateSatsPerSec)
    return {
      amountUsd: typeof parsed.amountUsd === 'string' ? parsed.amountUsd : '',
      memo: typeof parsed.memo === 'string' ? parsed.memo : '',
      updatedIso: typeof parsed.updatedIso === 'string' ? parsed.updatedIso : '',
      lastClaimSats: Number.isInteger(lastClaimSats) && lastClaimSats >= 0 ? lastClaimSats : 0,
      lastClaimIso: typeof parsed.lastClaimIso === 'string' ? parsed.lastClaimIso : '',
      rateSatsPerSec: Number.isFinite(rate) && rate >= 0 ? rate : 0
    }
  } catch {
    return { amountUsd: '', memo: '', updatedIso: '', lastClaimSats: 0, lastClaimIso: '', rateSatsPerSec: 0 }
  }
}

export function parseStreamFields(fields: Array<number[] | Uint8Array>): StreamPayload | null {
  if (fields.length < 11) return null
  try {
    const tag = utf8BytesToString(asBytes(fields[0]))
    if (tag !== TAG) return null
    const streamId = utf8BytesToString(asBytes(fields[1]))
    const org = utf8BytesToString(asBytes(fields[2]))
    const contractorName = utf8BytesToString(asBytes(fields[3]))
    const contractorIdentity = utf8BytesToString(asBytes(fields[4]))
    const treasurerIdentity = utf8BytesToString(asBytes(fields[5]))
    const amountSats = Number(utf8BytesToString(asBytes(fields[6])))
    const startIso = utf8BytesToString(asBytes(fields[7]))
    const durationSec = Number(utf8BytesToString(asBytes(fields[8])))
    const frozenRaw = utf8BytesToString(asBytes(fields[9]))
    const claimedSats = Number(utf8BytesToString(asBytes(fields[10])))
    const freezeIso = fields.length >= 12 ? utf8BytesToString(asBytes(fields[11])) : ''
    const extras = fields.length >= 13
      ? parseExtras(utf8BytesToString(asBytes(fields[12])))
      : { amountUsd: '', memo: '', updatedIso: '', lastClaimSats: 0, lastClaimIso: '', rateSatsPerSec: 0 }
    if (!isStreamId(streamId) || !isIdentityKey(treasurerIdentity)) return null
    if (contractorIdentity && !isIdentityKey(contractorIdentity)) return null
    if (!isIsoTimestamp(startIso)) return null
    if (!Number.isInteger(durationSec) || durationSec < 1) return null
    assertAmountSats(amountSats)
    if (!Number.isInteger(claimedSats) || claimedSats < 0) return null
    const rate = extras.rateSatsPerSec > 0 ? extras.rateSatsPerSec : rateSatsPerSec(amountSats, durationSec)
    return {
      tag: TAG,
      streamId,
      org,
      contractorName,
      contractorIdentity,
      treasurerIdentity,
      amountSats,
      rateSatsPerSec: rate,
      startIso,
      durationSec,
      frozen: frozenRaw === '1',
      claimedSats,
      freezeIso,
      amountUsd: extras.amountUsd,
      memo: extras.memo,
      updatedIso: extras.updatedIso,
      lastClaimSats: extras.lastClaimSats,
      lastClaimIso: extras.lastClaimIso
    }
  } catch {
    return null
  }
}

export interface IndexedStream {
  stream: StreamPayload
  txid: string
  outputIndex: number
}

export interface JoinedStream extends StreamPayload {
  txid: string
  outputIndex: number
}

function updatedMs(row: IndexedStream): number {
  const fromField = Date.parse(row.stream.updatedIso)
  if (Number.isFinite(fromField)) return fromField
  return 0
}

/**
 * Latest snapshot per streamId. claimedSats is the max seen (a later claim
 * after a freeze still raises it). Frozen/freezeIso stick once set.
 */
export function joinStreamRecords(rows: IndexedStream[]): JoinedStream[] {
  const byId = new Map<string, IndexedStream[]>()
  for (const row of rows) {
    const list = byId.get(row.stream.streamId)
    if (list) list.push(row)
    else byId.set(row.stream.streamId, [row])
  }

  const joined: JoinedStream[] = []
  for (const group of byId.values()) {
    const sorted = group.slice().sort((a, b) => {
      const delta = updatedMs(b) - updatedMs(a)
      if (delta !== 0) return delta
      if (b.stream.claimedSats !== a.stream.claimedSats) return b.stream.claimedSats - a.stream.claimedSats
      if (a.stream.frozen !== b.stream.frozen) return a.stream.frozen ? -1 : 1
      return 0
    })
    const latest = sorted[0]
    const claimedSats = group.reduce((max, row) => Math.max(max, row.stream.claimedSats), 0)
    const frozenRow = group.find((row) => row.stream.frozen)
    const contractor = group.find((row) => row.stream.contractorIdentity)?.stream.contractorIdentity ?? ''
    const lastClaim = group
      .filter((row) => row.stream.lastClaimSats > 0)
      .sort((a, b) => {
        const ta = Date.parse(a.stream.lastClaimIso) || updatedMs(a)
        const tb = Date.parse(b.stream.lastClaimIso) || updatedMs(b)
        return tb - ta
      })[0]
    joined.push({
      ...latest.stream,
      contractorIdentity: latest.stream.contractorIdentity || contractor,
      claimedSats,
      frozen: Boolean(frozenRow),
      freezeIso: frozenRow?.stream.freezeIso || latest.stream.freezeIso,
      lastClaimSats: lastClaim?.stream.lastClaimSats ?? latest.stream.lastClaimSats,
      lastClaimIso: lastClaim?.stream.lastClaimIso || latest.stream.lastClaimIso,
      txid: latest.txid,
      outputIndex: latest.outputIndex
    })
  }
  return joined
}

export function satsToUsd(sats: number, amountSats: number, amountUsd: string): number {
  const usd = Number(amountUsd)
  if (!(amountSats > 0) || !Number.isFinite(usd) || usd < 0) return 0
  return (sats / amountSats) * usd
}
