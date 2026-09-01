import { isIdentityKey } from '../../../protocol/title'
import { HOLDER_FALLBACK } from './copy'

const RESOLVE_MS = 4000

export function holderFaceName(resolved: string | null | undefined): string {
  const name = resolved?.trim()
  if (!name || isIdentityKey(name)) return HOLDER_FALLBACK
  return name
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

function identityKeyFromRecord(row: unknown): string | null {
  if (typeof row === 'string' && isIdentityKey(row)) return row.trim()
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  for (const key of ['identityKey', 'publicKey', 'pubkey', 'subject']) {
    const value = record[key]
    if (typeof value === 'string' && isIdentityKey(value)) return value.trim()
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

export async function resolveIdentity(input: string): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Write a name or an account to transfer to.')
  if (isIdentityKey(trimmed)) return trimmed
  try {
    const { IdentityClient } = await import('@bsv/sdk')
    const client = new IdentityClient()
    const resolve = (client as unknown as {
      resolveByAttributes?: (args: { attributes: Record<string, string> }) => Promise<unknown>
    }).resolveByAttributes
    if (typeof resolve !== 'function') {
      throw new Error('Could not resolve that name.')
    }
    const found = await Promise.race([
      resolve.call(client, { attributes: { userName: trimmed } }),
      new Promise<null>((resolveTimer) => setTimeout(() => resolveTimer(null), RESOLVE_MS))
    ])
    if (!found) throw new Error('Could not resolve that name.')
    const rows = Array.isArray(found) ? found : [found]
    for (const row of rows) {
      const key = identityKeyFromRecord(row)
      if (key) return key
    }
    throw new Error('Could not resolve that name.')
  } catch (error) {
    if (error instanceof Error && error.message.trim()) throw error
    throw new Error('Could not resolve that name.')
  }
}
