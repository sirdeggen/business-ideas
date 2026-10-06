import { describe, expect, it } from 'vitest'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/scrip'
import { nudgeScrip } from './messagebox'

describe('message box nudge', () => {
  it('uses the scrip box and skips a nudge to the same key', async () => {
    expect(MESSAGE_BOX).toBe('scrip')
    expect(MESSAGE_BOX_HOST).toBe('https://gmb.bsvblockchain.tech')
    await expect(nudgeScrip({} as WalletClient, 'abc', 'ABC', {
      kind: 'issue',
      scripId: 'ab'.repeat(16),
      txid: 'cd'.repeat(32)
    })).resolves.toBeUndefined()
  })
})
