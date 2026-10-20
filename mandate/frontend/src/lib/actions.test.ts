import { LockingScript, PrivateKey, ProtoWallet, Transaction, UnlockingScript, type CreateActionInput, type CreateActionOutput } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { NOT_WHITELISTED, OVER_CAP, SAMPLE_DESTINATION, SAMPLE_MANAGER, SAMPLE_OTHER, fundMandate, lockTimeFromIso, mandateLock, openMandate, recallMandate, sendMandate } from '../../../protocol/mandate'
import { parseWhole, recordMandate, assertCanOpen } from './actions'
import { txFromWalletBeef } from './overlay'

interface ActionCall {
  outputs?: CreateActionOutput[]
  inputs?: CreateActionInput[]
  lockTime?: number
  options?: { noSend?: boolean, sendWith?: string[] }
}

function beefBytes(tx: Transaction): number[] {
  try {
    return tx.toAtomicBEEF(true)
  } catch {
    return tx.toBEEF(true)
  }
}

describe('open form', () => {
  it('accepts a mandate and the default fee before any wallet call', () => {
    expect(parseWhole('1,000,000')).toBe(1_000_000)
    expect(parseWhole('')).toBeNull()
    const ready = assertCanOpen({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    })
    expect(ready.orgName).toBe('Harbor HOA Reserve')
    expect(ready.feeBps).toBe(800)
  })

  it('refuses a fee outside 5% to 10% before a wallet exists', () => {
    expect(() => assertCanOpen({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 499,
      noticeDays: 14
    })).toThrow(/5% to 10%/)
  })

  it('refuses an unlisted destination and a send over the cap before a wallet exists', () => {
    const opened = openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 1_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    }, '2026-10-20T00:00:00Z', 'ab'.repeat(16))
    const funded = fundMandate(opened, 50_000, '2026-10-20T00:00:00Z')
    expect(sendMandate(funded, SAMPLE_OTHER, 100, '2026-10-20T01:00:00Z').rejection).toBe(NOT_WHITELISTED)
    expect(sendMandate(funded, SAMPLE_DESTINATION, 1_001, '2026-10-20T01:00:00Z').rejection).toBe(OVER_CAP)
  })
})

describe('record puts the fund under the owner lock', () => {
  function walletFor(key = PrivateKey.fromRandom()) {
    const proto = new ProtoWallet(key)
    const calls: ActionCall[] = []
    const spends: string[] = []
    const txids: string[] = []
    let lastBeef: number[] = []
    const wallet = Object.assign(proto, {
      async createAction(args: ActionCall & { inputBEEF?: number[], description?: string }) {
        calls.push(args)
        if (args.inputs?.length) {
          const fund = txFromWalletBeef(args.inputBEEF ?? lastBeef)
          const vout = Number(args.inputs[0]?.outpoint.split('.')[1])
          const spend = new Transaction(1, [], [], args.lockTime ?? 0)
          spend.addInput({
            sourceTransaction: fund,
            sourceOutputIndex: vout,
            sequence: 0xffffffff,
            unlockingScript: new UnlockingScript()
          })
          return {
            signableTransaction: { reference: 'recall', tx: spend.toAtomicBEEF(true) }
          }
        }
        const tx = new Transaction(1, [], [], args.lockTime ?? 0)
        for (const output of args.outputs ?? []) {
          tx.addOutput({
            lockingScript: LockingScript.fromHex(output.lockingScript),
            satoshis: output.satoshis
          })
        }
        lastBeef = beefBytes(tx)
        const txid = tx.id('hex')
        txids.push(txid)
        return { txid, tx: lastBeef }
      },
      async signAction(args: { spends?: Record<string, { unlockingScript?: string }> }) {
        const unlocking = args.spends?.['0']?.unlockingScript
        if (unlocking) spends.push(unlocking)
        return { txid: 'cd'.repeat(32), tx: [1, 0, 0] }
      }
    })
    return { wallet, calls, spends, txids, key }
  }

  it('funds the owner-lock output and spends it on recall', async () => {
    const { wallet, calls, spends, txids } = walletFor()
    const identity = (await wallet.getPublicKey({ identityKey: true })).publicKey.toLowerCase()
    let desk = openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14,
      ownerKey: identity
    }, '2026-10-20T00:00:00Z', 'ab'.repeat(16))
    desk = fundMandate(desk, 50_000, '2026-10-20T00:00:00Z')
    const funded = await recordMandate(wallet, 'http://127.0.0.1:9', identity, desk)
    const lock = funded.desk.mandate?.lockHex
    expect(lock).toBe(mandateLock(identity))
    const lockOutput = calls[0]?.outputs?.find((output) => output.lockingScript === lock)
    expect(lockOutput?.satoshis).toBe(50_000)
    expect(calls[0]?.lockTime).toBe(lockTimeFromIso(funded.desk.mandate!.openedAt))
    expect(calls[0]?.options?.noSend).toBe(false)
    expect(calls).toHaveLength(1)

    const recalled = await recordMandate(wallet, 'http://127.0.0.1:9', identity, recallMandate(desk, '2026-10-20T01:00:00Z'))
    const recallLock = recalled.desk.mandate?.lockHex
    const vout = calls[1]?.outputs?.findIndex((output) => output.lockingScript === recallLock)
    expect(calls[1]?.options?.noSend).toBe(true)
    expect(vout).toBeGreaterThanOrEqual(0)
    expect(calls[2]?.inputs?.[0]?.outpoint).toBe(`${txids[1]}.${vout}`)
    expect(calls[2]?.inputs?.[0]?.unlockingScriptLength).toBe(73)
    expect(calls[2]?.options?.sendWith).toEqual([txids[1]])
    expect(spends[0]?.length).toBeGreaterThan(16)
    expect(recalled.desk.recalls).toHaveLength(1)
  })
})
