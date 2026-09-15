import { isIdentityKey } from '../../../protocol/handoff'
import { BUYER_FALLBACK, SELLER_FALLBACK } from './copy'

const RESOLVE_MS = 4000

export function partyFaceName(resolved: string | null | undefined, fallback: string): string {
  const name = resolved?.trim()
  if (!name || isIdentityKey(name)) return fallback
  return name
}

export function sellerLine(resolved: string | null | undefined): string {
  const face = partyFaceName(resolved, SELLER_FALLBACK)
  if (face === SELLER_FALLBACK) return SELLER_FALLBACK
  return face
}

export function buyerLine(resolved: string | null | undefined): string {
  const face = partyFaceName(resolved, BUYER_FALLBACK)
  if (face === BUYER_FALLBACK) return BUYER_FALLBACK
  return face
}

function nameFromRecord(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const attrs = (record.attributes || record.decryptedFields || record) as Record<string, unknown>
  for (const key of ['name', 'userName', 'displayName', 'organization', 'orgName']) {
    const value = attrs[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function displayNameFor(identityKey: string): Promise<string | null> {
  if (!isIdentityKey(identityKey)) return null
  try {
    const { IdentityClient } = await import('@bsv/sdk')
    const client = new IdentityClient()
    const discover = (client as unknown as {
      discoverByIdentityKey?: (args: { identityKey: string }) => Promise<unknown>
    }).discoverByIdentityKey
    if (typeof discover !== 'function') return null
    const found = await Promise.race([
      discover.call(client, { identityKey: identityKey.trim() }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RESOLVE_MS))
    ])
    if (!found) return null
    const rows = Array.isArray(found) ? found : [found]
    for (const row of rows) {
      const name = nameFromRecord(row)
      if (name) return name
    }
    return null
  } catch {
    return null
  }
}
