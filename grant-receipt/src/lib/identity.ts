import { isIdentityKey } from './protocol'

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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
    ])
    if (!found) return null
    const rows = Array.isArray(found) ? found : [found]
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const record = row as Record<string, unknown>
      const attrs = (record.attributes || record.decryptedFields || record) as Record<string, unknown>
      for (const key of ['name', 'userName', 'displayName', 'organization', 'orgName']) {
        const value = attrs[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
    return null
  } catch {
    return null
  }
}
