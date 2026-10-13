import { describe, expect, it } from 'vitest'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/check'
import { nudgeCheck } from './messagebox'

describe('message box nudge', () => {
  it('uses the check box and skips a nudge to the same key', async () => {
    expect(MESSAGE_BOX).toBe('check')
    expect(MESSAGE_BOX_HOST).toBe('https://gmb.bsvblockchain.tech')
    await expect(nudgeCheck({} as WalletClient, 'abc', 'ABC', {
      kind: 'receipt',
      checkId: 'ab'.repeat(16),
      txid: 'cd'.repeat(32)
    })).resolves.toBeUndefined()
  })
})
