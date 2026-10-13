import { Script } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { SAMPLE_RECIPIENT, pieceLock } from '../../../protocol/keepsake'

describe('piece lock', () => {
  it('requires the holder signature and does not check the resale split', () => {
    const asm = Script.fromHex(pieceLock(SAMPLE_RECIPIENT)).toASM()
    expect(asm).toContain('OP_CHECKSIG')
    expect(asm).not.toContain('OP_MUL')
    expect(asm).not.toContain('OP_DIV')
    expect(asm).not.toContain('OP_EQUALVERIFY')
    expect(asm.endsWith('OP_CHECKSIG')).toBe(true)
  })
})
