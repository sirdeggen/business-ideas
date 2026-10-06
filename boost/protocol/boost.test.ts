import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  BOOST_PACKS,
  MAGIC,
  PROFILE_FEE_SATS,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  admitProfiles,
  boostIsActive,
  buildReading,
  bytesToHex,
  canonicalBoostBytes,
  canonicalProfileBytes,
  encodeBoostFields,
  encodeProfileFields,
  endsAtFrom,
  isDuplicateProfile,
  makeBoostId,
  parseBoostFields,
  profileBindingId,
  quoteBoost,
  quoteProfile,
  rankDirectory,
  type BoostRecord,
  type ProfileRecord
} from './boost'

const DESK = `03${'cd'.repeat(32)}`
const WHEN = '2026-10-06T12:00:00Z'
const LATER = '2026-10-06T13:00:00Z'
const HOUR = 60 * 60 * 1000

async function ownerWallet(): Promise<{ wallet: WalletInterface, owner: string }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { wallet, owner: publicKey }
}

async function signProfile(
  wallet: WalletInterface,
  draft: Omit<ProfileRecord, 'magic' | 'version' | 'kind' | 'signature' | 'profileId'> & { profileId?: string }
): Promise<ProfileRecord> {
  const profileId = draft.profileId ?? profileBindingId(draft)
  const body = { ...draft, profileId }
  const { signature } = await wallet.createSignature({
    data: canonicalProfileBytes(body),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return {
    magic: MAGIC,
    version: '1',
    kind: 'profile',
    ...body,
    signature: bytesToHex(signature)
  }
}

async function signBoost(
  wallet: WalletInterface,
  draft: Omit<BoostRecord, 'magic' | 'version' | 'kind' | 'signature'>
): Promise<BoostRecord> {
  const { signature } = await wallet.createSignature({
    data: canonicalBoostBytes(draft),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return {
    magic: MAGIC,
    version: '1',
    kind: 'boost',
    ...draft,
    signature: bytesToHex(signature)
  }
}

describe('fee math', () => {
  it('prices a profile once and the two boost packs', () => {
    expect(quoteProfile()).toEqual({ profileFeeSats: PROFILE_FEE_SATS })
    expect(PROFILE_FEE_SATS).toBe(2_000)
    expect(quoteBoost('12h')).toEqual({ pack: '12h', hours: 12, paidSats: BOOST_PACKS['12h'].sats })
    expect(quoteBoost('24h')).toEqual({ pack: '24h', hours: 24, paidSats: 1_800 })
    expect(BOOST_PACKS['12h'].sats).toBe(1_000)
    expect(quoteBoost('24h').paidSats).toBeLessThan(quoteBoost('12h').paidSats * 2)
  })
})

describe('encode and decode', () => {
  it('round-trips a signed profile and a signed boost', async () => {
    const { wallet, owner } = await ownerWallet()
    const profile = await signProfile(wallet, {
      category: 'business',
      name: 'Harbor market',
      blurb: 'Saturday stalls, coffee, and local makers.',
      link: 'https://harbor.example',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const parsedProfile = parseBoostFields(encodeProfileFields(profile))
    expect(parsedProfile).toEqual(profile)

    const startsAt = WHEN
    const boost = await signBoost(wallet, {
      profileId: profile.profileId,
      boostId: makeBoostId(profile.profileId, owner, '12h', startsAt, 'aa'),
      owner,
      pack: '12h',
      hours: 12,
      paidSats: 1_000,
      startsAt,
      endsAt: endsAtFrom(startsAt, 12)
    })
    expect(parseBoostFields(encodeBoostFields(boost))).toEqual(boost)
  })

  it('rejects a boost whose price or window does not match the pack', async () => {
    const { wallet, owner } = await ownerWallet()
    const profile = await signProfile(wallet, {
      category: 'event',
      name: 'Night fair',
      blurb: 'One night on the pier.',
      link: '',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const startsAt = WHEN
    const boostId = makeBoostId(profile.profileId, owner, '12h', startsAt, 'bb')
    const badPrice = await signBoost(wallet, {
      profileId: profile.profileId,
      boostId,
      owner,
      pack: '12h',
      hours: 12,
      paidSats: 50,
      startsAt,
      endsAt: endsAtFrom(startsAt, 12)
    })
    expect(() => encodeBoostFields(badPrice)).toThrow(/price/i)
    expect(parseBoostFields(encodeProfileFields(profile))?.kind).toBe('profile')

    const badWindow = await signBoost(wallet, {
      profileId: profile.profileId,
      boostId,
      owner,
      pack: '24h',
      hours: 24,
      paidSats: 1_800,
      startsAt,
      endsAt: endsAtFrom(startsAt, 12)
    })
    expect(() => encodeBoostFields(badWindow)).toThrow(/window/i)
  })

  it('drops another desk’s magic', async () => {
    const { wallet, owner } = await ownerWallet()
    const profile = await signProfile(wallet, {
      category: 'vendor',
      name: 'River stalls',
      blurb: 'Prints and coffee.',
      link: '',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const fields = encodeProfileFields(profile)
    fields[0] = Array.from(new TextEncoder().encode('cover'))
    expect(parseBoostFields(fields)).toBeNull()
    expect(parseBoostFields([Array.from(new TextEncoder().encode('feed'))])).toBeNull()
  })
})

describe('ranking windows', () => {
  it('ranks an open boost above a newer unboosted listing, then demotes it when the window ends', async () => {
    const first = await ownerWallet()
    const second = await ownerWallet()
    const older = await signProfile(first.wallet, {
      category: 'business',
      name: 'Harbor market',
      blurb: 'Saturday stalls.',
      link: '',
      owner: first.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const newer = await signProfile(second.wallet, {
      category: 'vendor',
      name: 'River stalls',
      blurb: 'Prints and coffee.',
      link: '',
      owner: second.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: LATER
    })
    const startsAt = WHEN
    const boost = await signBoost(first.wallet, {
      profileId: older.profileId,
      boostId: makeBoostId(older.profileId, first.owner, '12h', startsAt, 'cc'),
      owner: first.owner,
      pack: '12h',
      hours: 12,
      paidSats: 1_000,
      startsAt,
      endsAt: endsAtFrom(startsAt, 12)
    })
    const during = Date.parse(WHEN) + HOUR
    const duringRank = rankDirectory([newer, older], [boost], during)
    expect(duringRank.map((row) => row.profile.name)).toEqual(['Harbor market', 'River stalls'])
    expect(duringRank[0]?.boosted).toBe(true)
    expect(duringRank[1]?.boosted).toBe(false)
    expect(boostIsActive(boost, during)).toBe(true)

    const atEnd = Date.parse(boost.endsAt)
    expect(boostIsActive(boost, atEnd)).toBe(false)
    const after = rankDirectory([older, newer], [boost], atEnd)
    expect(after.map((row) => row.profile.name)).toEqual(['River stalls', 'Harbor market'])
    expect(after.every((row) => row.boosted === false)).toBe(true)

    const reading = buildReading(older, [boost], atEnd, '2026-10-07T00:00:00Z')
    expect(reading.kind).toBe('boost-reading')
    expect(reading.boosted).toBe(false)
    expect(reading.boosts).toHaveLength(1)
    expect(reading.boosts[0]?.active).toBe(false)
    expect(reading.boosts[0]?.paidSats).toBe(1_000)
  })

  it('keeps the longer open window above a shorter one', async () => {
    const first = await ownerWallet()
    const second = await ownerWallet()
    const day = await signProfile(first.wallet, {
      category: 'event',
      name: 'Day market',
      blurb: 'Morning stalls.',
      link: '',
      owner: first.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const night = await signProfile(second.wallet, {
      category: 'event',
      name: 'Night market',
      blurb: 'Evening stalls.',
      link: '',
      owner: second.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: LATER
    })
    const shortBoost = await signBoost(second.wallet, {
      profileId: night.profileId,
      boostId: makeBoostId(night.profileId, second.owner, '12h', WHEN, 'dd'),
      owner: second.owner,
      pack: '12h',
      hours: 12,
      paidSats: 1_000,
      startsAt: WHEN,
      endsAt: endsAtFrom(WHEN, 12)
    })
    const longBoost = await signBoost(first.wallet, {
      profileId: day.profileId,
      boostId: makeBoostId(day.profileId, first.owner, '24h', WHEN, 'ee'),
      owner: first.owner,
      pack: '24h',
      hours: 24,
      paidSats: 1_800,
      startsAt: WHEN,
      endsAt: endsAtFrom(WHEN, 24)
    })
    const ranked = rankDirectory([night, day], [shortBoost, longBoost], Date.parse(WHEN) + HOUR)
    expect(ranked.map((row) => row.profile.name)).toEqual(['Day market', 'Night market'])
    expect(ranked[0]?.activeBoost?.pack).toBe('24h')
  })

  it('ignores a boost signed by someone who does not own the profile', async () => {
    const host = await ownerWallet()
    const stranger = await ownerWallet()
    const profile = await signProfile(host.wallet, {
      category: 'business',
      name: 'Harbor market',
      blurb: 'Saturday stalls.',
      link: '',
      owner: host.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const foreign = await signBoost(stranger.wallet, {
      profileId: profile.profileId,
      boostId: makeBoostId(profile.profileId, stranger.owner, '24h', WHEN, 'ff'),
      owner: stranger.owner,
      pack: '24h',
      hours: 24,
      paidSats: 1_800,
      startsAt: WHEN,
      endsAt: endsAtFrom(WHEN, 24)
    })
    const ranked = rankDirectory([profile], [foreign], Date.parse(WHEN) + HOUR)
    expect(ranked[0]?.boosted).toBe(false)
    const reading = buildReading(profile, [foreign], Date.parse(WHEN) + HOUR, WHEN)
    expect(reading.boosts).toHaveLength(0)
  })
})

describe('duplicate profile collision', () => {
  it('keeps the earliest listing when the same owner reuses a name', async () => {
    const { wallet, owner } = await ownerWallet()
    const other = await ownerWallet()
    const first = await signProfile(wallet, {
      category: 'business',
      name: 'Harbor market',
      blurb: 'The first blurb.',
      link: '',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    })
    const duplicate = await signProfile(wallet, {
      category: 'vendor',
      name: 'harbor market',
      blurb: 'A later blurb that must not replace the first.',
      link: 'https://later.example',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: LATER
    })
    const sameNameOtherOwner = await signProfile(other.wallet, {
      category: 'business',
      name: 'Harbor market',
      blurb: 'A different owner.',
      link: '',
      owner: other.owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: LATER
    })

    expect(isDuplicateProfile([first], duplicate)).toBe(true)
    expect(isDuplicateProfile([first], sameNameOtherOwner)).toBe(false)
    const admitted = admitProfiles([duplicate, sameNameOtherOwner, first])
    expect(admitted.map((row) => row.profileId).sort()).toEqual([first.profileId, sameNameOtherOwner.profileId].sort())
    const ranked = rankDirectory([duplicate, first, sameNameOtherOwner], [], Date.parse(LATER))
    expect(ranked).toHaveLength(2)
    expect(ranked.find((row) => row.profile.owner === owner)?.profile.blurb).toBe('The first blurb.')
    expect(ranked.find((row) => row.profile.owner === owner)?.profile.name).toBe('Harbor market')
  })
})
