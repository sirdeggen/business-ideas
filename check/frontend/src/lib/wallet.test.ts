import { describe, expect, it } from 'vitest'
import { CONNECT_MS, withTimeout } from './wallet'

describe('wallet connect', () => {
  it('rejects when the wallet does not answer in time', async () => {
    expect(CONNECT_MS).toBeGreaterThan(0)
    await expect(withTimeout(new Promise(() => undefined), 20, 'slow')).rejects.toThrow('slow')
  })
})
