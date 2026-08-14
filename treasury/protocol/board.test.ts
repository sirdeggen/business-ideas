import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  STRANGER_BOARD_FIRST,
  STRANGER_BOARD_HIDDEN,
  isStrangerBoardForbidden,
  strangerBoardPanels,
  vaultBalanceCopy
} from './board.ts'

describe('stranger ?treasury= board chrome', () => {
  it('leads with name, minutes, and proposals — not Fund or 0 sats', () => {
    const board = strangerBoardPanels('Demo Club')
    assert.equal(board.title, 'Demo Club')
    assert.deepEqual([...board.first], ['name', 'minutes', 'proposals'])
    assert.ok(STRANGER_BOARD_FIRST[0] === 'name')
    assert.ok(STRANGER_BOARD_HIDDEN.includes('fund'))
    assert.ok(STRANGER_BOARD_HIDDEN.includes('vault-sats'))
    assert.ok(STRANGER_BOARD_HIDDEN.includes('propose'))
    assert.ok(STRANGER_BOARD_HIDDEN.includes('identity-key'))
    assert.ok(STRANGER_BOARD_HIDDEN.includes('connect-wallet'))

    const minutes = [
      'Demo Club opened as a 2-of-3 board.',
      'Treasurer joined.'
    ]
    for (const line of minutes) {
      assert.equal(isStrangerBoardForbidden(line), false)
    }
    assert.equal(isStrangerBoardForbidden('Current vault: 0 sats'), true)
    assert.equal(isStrangerBoardForbidden('Fund the vault'), true)
    assert.equal(isStrangerBoardForbidden('Propose a payment'), true)
    assert.equal(isStrangerBoardForbidden('Chair identity key (optional)'), true)
    assert.equal(isStrangerBoardForbidden('Connect BSV wallet'), true)
  })

  it('never describes the vault in sats', () => {
    assert.equal(vaultBalanceCopy('$25.00', true), 'Current vault: $25.00.')
    assert.equal(vaultBalanceCopy(null, true), 'Vault has funds.')
    assert.equal(vaultBalanceCopy(null, false), 'Vault is empty.')
    assert.equal(isStrangerBoardForbidden(vaultBalanceCopy(null, false)), false)
    assert.ok(!/sats/i.test(vaultBalanceCopy('$0.00', false)))
  })
})
