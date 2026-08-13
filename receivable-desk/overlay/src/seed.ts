/**
 * Mint 10 sample receivables as a real PushDrop transaction and submit
 * them to a local overlay-express node. Uses @bsv/sdk Transaction +
 * BRC-48 scripts (same shape a BRC-100 wallet would create). Does not
 * hold customer keys or custody invoice sats.
 */
import { Transaction } from '@bsv/sdk'
import { LOOKUP_SERVICE, TOPIC, encodeReceivableFields } from '../../protocol/receivable'
import { lockPushDrop } from '../../protocol/pushdrop'
import { sampleOperatorPublicKey, sampleReceivables } from '../../protocol/samples'

function overlayUrl(): string {
  return (process.env.OVERLAY_URL || 'http://localhost:8080').replace(/\/$/, '')
}

async function waitForOverlay(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${url}/version`)
      if (response.ok) return
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`Overlay at ${url} did not become ready`)
}

export function buildSampleRegisterTx(): Transaction {
  const tx = new Transaction()
  const lockingKey = sampleOperatorPublicKey()
  for (const item of sampleReceivables()) {
    tx.addOutput({
      satoshis: 1,
      lockingScript: lockPushDrop(encodeReceivableFields(item), lockingKey)
    })
  }
  return tx
}

async function main(): Promise<void> {
  const url = overlayUrl()
  await waitForOverlay(url)

  const existing = await fetch(`${url}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: LOOKUP_SERVICE, query: {} })
  })
  if (existing.ok) {
    const body: unknown = await existing.json()
    const count = Array.isArray(body)
      ? body.length
      : Array.isArray((body as { result?: unknown[] }).result)
        ? (body as { result: unknown[] }).result.length
        : 0
    if (count >= 10) {
      console.log(`Overlay already has ${count} receivables; skip seed.`)
      return
    }
  }

  const tx = buildSampleRegisterTx()
  const beef = tx.toBEEF()
  const response = await fetch(`${url}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-topics': TOPIC
    },
    body: JSON.stringify(beef)
  })
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(`Overlay /submit failed (${response.status}): ${JSON.stringify(raw)}`)
  }
  const admitted = (raw as Record<string, { outputsToAdmit?: number[] }>)?.[TOPIC]?.outputsToAdmit ?? []
  console.log(`Seeded ${admitted.length} sample receivables in ${tx.id('hex')}`)
  for (const item of sampleReceivables()) {
    console.log(`  ${item.invoiceId} ${item.status} ${item.amountSats} sats due ${item.dueDate}`)
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
