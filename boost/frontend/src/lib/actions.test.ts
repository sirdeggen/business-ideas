import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PROFILE_FEE_SATS,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  bytesToHex,
  canonicalProfileBytes,
  profileBindingId,
  quoteBoost,
  type ProfileRecord
} from '../../../protocol/boost'
import { assertCanBoost, assertCanBuy, readingFor } from './actions'
import { DUPLICATE_PROFILE, NOT_OWNER } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const app = readFileSync(join(here, '../App.tsx'), 'utf8')

const OWNER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`
const WHEN = '2026-10-06T12:00:00Z'

function stub(owner = OWNER): ProfileRecord {
  return {
    magic: 'boost',
    version: '1',
    kind: 'profile',
    profileId: 'ab'.repeat(16),
    category: 'business',
    name: 'Harbor market',
    blurb: 'Saturday stalls.',
    link: '',
    owner,
    desk: OTHER,
    profileFeeSats: PROFILE_FEE_SATS,
    createdAt: WHEN,
    signature: 'aa'.repeat(32)
  }
}

async function signedProfile(name: string): Promise<{ owner: string, profile: ProfileRecord }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey: owner } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  const draft = {
    category: 'business' as const,
    name,
    blurb: 'Saturday stalls.',
    link: '',
    owner,
    desk: OTHER,
    profileFeeSats: PROFILE_FEE_SATS,
    createdAt: WHEN
  }
  const profileId = profileBindingId(draft)
  const { signature } = await wallet.createSignature({
    data: canonicalProfileBytes({ ...draft, profileId }),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return {
    owner,
    profile: {
      magic: MAGIC,
      version: '1',
      kind: 'profile',
      profileId,
      ...draft,
      signature: bytesToHex(signature)
    }
  }
}

describe('buy profile and buy boost gates', () => {
  it('quotes the profile fee before a wallet is required', () => {
    const ready = assertCanBuy({
      category: 'business',
      name: ' Harbor market ',
      blurb: ' Saturday stalls. ',
      link: '',
      desk: ''
    }, OWNER)
    expect(ready.name).toBe('Harbor market')
    expect(ready.blurb).toBe('Saturday stalls.')
    expect(ready.desk).toBe(OWNER)
    expect(ready.profileFeeSats).toBe(2_000)
    expect(ready.owner).toBe(OWNER)
  })

  it('refuses a second listing under the same name for that owner', async () => {
    const { owner, profile } = await signedProfile('Harbor market')
    expect(() => assertCanBuy({
      category: 'vendor',
      name: 'harbor market',
      blurb: 'A later blurb.',
      link: '',
      desk: ''
    }, OTHER, owner, [profile])).toThrow(DUPLICATE_PROFILE)
  })

  it('lets only the owner buy a boost, at the pack price', () => {
    expect(() => assertCanBoost(stub(), OTHER, '12h')).toThrow(NOT_OWNER)
    expect(assertCanBoost(stub(), OWNER, '24h')).toEqual(quoteBoost('24h'))
    expect(() => assertCanBoost(stub(), OWNER, '48h')).toThrow(/12-hour or 24-hour/)
  })

  it('labels the profile fee and the boost pack in the wallet outputs', () => {
    expect(actionsSrc).toContain('Profile fee for')
    expect(actionsSrc).toContain('Boost pack (${pack}) for')
    expect(actionsSrc).toContain('createAction')
    expect(actionsSrc).toContain('createSignature')
    expect(actionsSrc).not.toMatch(/USDC|x402|Ethereum|Solana|Coinbase|Bitcoin Core/i)
  })

  it('exports a reading without a wallet', async () => {
    const exportFn = app.slice(app.indexOf('const runExport'))
    expect(exportFn.slice(0, exportFn.indexOf('const runOpen'))).not.toContain('ensureWallet')
    expect(actionsSrc).toContain('export function downloadReading')
    const download = actionsSrc.slice(
      actionsSrc.indexOf('export function downloadReading'),
      actionsSrc.indexOf('export function readingFor')
    )
    expect(download).not.toContain('connectWallet')
    expect(download).not.toContain('ensureWallet')
    const { profile } = await signedProfile('Harbor market')
    const reading = readingFor(profile, [], Date.parse(WHEN))
    expect(reading.kind).toBe('boost-reading')
    expect(reading.name).toBe('Harbor market')
    expect(reading.boosted).toBe(false)
    expect(reading.profileFeeSats).toBe(PROFILE_FEE_SATS)
  })
})
