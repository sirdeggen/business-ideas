import { describe, expect, it } from 'vitest'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/keepsake'
import { nudgeKeepsake } from './messagebox'

describe('message box nudge', () => {
  it('uses the keepsake box and skips a nudge to the same key', async () => {
    expect(MESSAGE_BOX).toBe('keepsake')
    expect(MESSAGE_BOX_HOST).toBe('https://gmb.bsvblockchain.tech')
    await expect(nudgeKeepsake({} as WalletClient, 'abc', 'ABC', {
      kind: 'send',
      keepsakeId: 'ab'.repeat(16),
      serial: 1,
      txid: 'cd'.repeat(32)
    })).resolves.toBeUndefined()
  })
})
