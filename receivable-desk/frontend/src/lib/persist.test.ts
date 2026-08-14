import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/receivable'
import { unionChaseRows } from './basket'
import {
  CHASE_STORE_KEY,
  chaseRowFromRegister,
  loadChaseRows,
  rememberChaseRow,
  saveChaseRows
} from './persist'

const row = chaseRowFromRegister({
  magic: MAGIC,
  invoiceId: 'QA-0813-DESK',
  creditor: '02' + 'ab'.repeat(32),
  debtor: '03' + 'cd'.repeat(32),
  amountSats: 245,
  dueDate: '2026-09-30',
  status: 'open',
  memo: 'hex',
  advanceBps: 0
}, 'aa'.repeat(32), 0)

describe('chase persist', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) }
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage }
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage
    })
  })

  afterEach(() => {
    memory.clear()
  })

  it('remembers a recorded invoice so Chase can show it after reload', () => {
    rememberChaseRow(row)
    expect(loadChaseRows().map((item) => item.invoiceId)).toEqual(['QA-0813-DESK'])
  })

  it('unions overlay, basket, and remembered rows so Chase is not empty', () => {
    const named = chaseRowFromRegister({
      ...row,
      invoiceId: 'QA-0813-NAMED',
      debtor: 'Alex',
      creditor: 'Riverside Hall',
      amountSats: 252
    }, 'bb'.repeat(32), 0)
    saveChaseRows([row])
    const combined = unionChaseRows([], [], loadChaseRows())
    expect(combined.map((item) => item.invoiceId)).toEqual(['QA-0813-DESK'])
    const withNamed = unionChaseRows([named], [], loadChaseRows())
    expect(withNamed.map((item) => item.invoiceId).sort()).toEqual(['QA-0813-DESK', 'QA-0813-NAMED'])
  })

  it('collapses two QA-0813-DESK copies into one row', () => {
    const copy = chaseRowFromRegister({
      ...row,
      debtor: 'QA Debtor'
    }, 'cc'.repeat(32), 1)
    const combined = unionChaseRows([row], [], [copy])
    expect(combined).toHaveLength(1)
    expect(combined[0].invoiceId).toBe('QA-0813-DESK')
    expect(combined[0].debtor).toBe('QA Debtor')
  })
})
