import { ADVANCE_BPS, MAGIC, type ReceivablePayload, type ReceivableStatus } from './receivable'

/**
 * Stable demo identity keys (compressed pubkeys from fixed private seeds).
 * Seeds are local-demo only and are not funded wallets.
 */
export const SAMPLE_PARTIES: Record<string, { name: string, identityKey: string }> = {
  northwind: {
    name: 'Northwind Logistics',
    identityKey: '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'
  },
  foundry: {
    name: 'Overlay Foundry',
    identityKey: '02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27'
  },
  helios: {
    name: 'Helios Grid Co',
    identityKey: '023c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b1'
  },
  mill: {
    name: 'Copper Mill Ltd',
    identityKey: '032c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991'
  },
  harbor: {
    name: 'Harbor Packing',
    identityKey: '029ac20335eb38768d2052be1dbbc3c8f6178407458e51e6b4ad22f1d91758895b'
  },
  lumen: {
    name: 'Lumen Assay',
    identityKey: '035ab4689e400a4a160cf01cd44730845a54768df8547dcdf073d964f109f18c30'
  }
}

/** PushDrop lock used by the local seed transaction. */
export const SAMPLE_OPERATOR_PUBLIC_KEY =
  '037962d45b38e8bcf82fa8efa8432a01f20c9a53e24c7d3f11df197cb8e70926da'

export interface SampleParty {
  slug: string
  name: string
  identityKey: string
}

export function sampleParty(slug: string): SampleParty {
  const party = SAMPLE_PARTIES[slug]
  if (!party) throw new Error(`Unknown sample party ${slug}`)
  return { slug, ...party }
}

export function sampleOperatorPublicKey(): string {
  return SAMPLE_OPERATOR_PUBLIC_KEY
}

interface SampleSpec {
  invoiceId: string
  creditor: string
  debtor: string
  amountSats: number
  dueDate: string
  status: ReceivableStatus
  memo: string
  advanceBps?: number
}

const SPECS: SampleSpec[] = [
  {
    invoiceId: 'INV-2026-001',
    creditor: 'northwind',
    debtor: 'foundry',
    amountSats: 12000,
    dueDate: '2026-09-15',
    status: 'open',
    memo: 'Q3 line-haul, Austin yard'
  },
  {
    invoiceId: 'INV-2026-002',
    creditor: 'helios',
    debtor: 'northwind',
    amountSats: 25000,
    dueDate: '2026-09-01',
    status: 'open',
    memo: 'Grid interconnect study'
  },
  {
    invoiceId: 'INV-2026-003',
    creditor: 'mill',
    debtor: 'harbor',
    amountSats: 8000,
    dueDate: '2026-08-20',
    status: 'open',
    memo: 'Copper cathode lot 44'
  },
  {
    invoiceId: 'INV-2026-004',
    creditor: 'lumen',
    debtor: 'helios',
    amountSats: 50000,
    dueDate: '2026-10-01',
    status: 'open',
    memo: 'Assay + custody report'
  },
  {
    invoiceId: 'INV-2026-005',
    creditor: 'foundry',
    debtor: 'mill',
    amountSats: 18000,
    dueDate: '2026-08-28',
    status: 'approved',
    memo: 'Overlay node cluster hours'
  },
  {
    invoiceId: 'INV-2026-006',
    creditor: 'harbor',
    debtor: 'northwind',
    amountSats: 33000,
    dueDate: '2026-09-10',
    status: 'approved',
    memo: 'Reefer containers, week 32'
  },
  {
    invoiceId: 'INV-2026-007',
    creditor: 'helios',
    debtor: 'foundry',
    amountSats: 41000,
    dueDate: '2026-08-25',
    status: 'approved',
    memo: 'Power purchase, August'
  },
  {
    invoiceId: 'INV-2026-008',
    creditor: 'northwind',
    debtor: 'lumen',
    amountSats: 9600,
    dueDate: '2026-09-30',
    status: 'approved',
    memo: 'Last-mile to assay lab',
    advanceBps: ADVANCE_BPS
  },
  {
    invoiceId: 'INV-2026-009',
    creditor: 'mill',
    debtor: 'helios',
    amountSats: 15000,
    dueDate: '2026-07-31',
    status: 'paid',
    memo: 'Bus bar fabrication'
  },
  {
    invoiceId: 'INV-2026-010',
    creditor: 'harbor',
    debtor: 'foundry',
    amountSats: 22000,
    dueDate: '2026-08-01',
    status: 'paid',
    memo: 'Wharfage, July close'
  }
]

export function sampleReceivables(): ReceivablePayload[] {
  return SPECS.map((spec) => ({
    magic: MAGIC,
    invoiceId: spec.invoiceId,
    creditor: sampleParty(spec.creditor).identityKey,
    debtor: sampleParty(spec.debtor).identityKey,
    amountSats: spec.amountSats,
    dueDate: spec.dueDate,
    status: spec.status,
    memo: spec.memo,
    advanceBps: spec.advanceBps ?? 0
  }))
}

export function samplePartyName(identityKey: string): string | undefined {
  for (const party of Object.values(SAMPLE_PARTIES)) {
    if (party.identityKey === identityKey) return party.name
  }
  return undefined
}
