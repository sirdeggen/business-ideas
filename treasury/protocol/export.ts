import { ROLE_LABEL, shortKey, type Role } from './treasury.js'
import type { Proposal, Treasury } from './events.js'

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function paymentsInMonth(treasury: Treasury, yearMonth: string): Proposal[] {
  return treasury.proposals.filter(
    (proposal) => proposal.status === 'paid' && monthKey(proposal.createdAt) === yearMonth
  )
}

export function paymentsCsv(treasury: Treasury, yearMonth: string): string {
  const rows = paymentsInMonth(treasury, yearMonth)
  const header = 'date,memo,payee,sats,txid,approvers'
  const lines = rows.map((proposal) => {
    const approvers = proposal.approvals
      .map((approval) => ROLE_LABEL[approval.role as Role] ?? approval.role)
      .join('|')
    return [
      proposal.createdAt,
      `"${proposal.memo.replace(/"/g, '""')}"`,
      proposal.payeeIdentityKey,
      String(proposal.amountSats),
      proposal.txid ?? '',
      `"${approvers}"`
    ].join(',')
  })
  return [header, ...lines, ''].join('\n')
}

export function paymentsPdf(treasury: Treasury, yearMonth: string): Uint8Array {
  const rows = paymentsInMonth(treasury, yearMonth)
  const total = rows.reduce((sum, proposal) => sum + proposal.amountSats, 0)
  const lines: string[] = [
    `${treasury.name} — ${yearMonth} payments`,
    `${treasury.threshold}-of-${treasury.signers.length} BSV policy treasury`,
    ''
  ]
  if (rows.length === 0) {
    lines.push('No paid proposals this month.')
  } else {
    for (const proposal of rows) {
      const who = proposal.approvals.map((approval) => ROLE_LABEL[approval.role as Role] ?? approval.role).join(', ')
      lines.push(`${proposal.createdAt.slice(0, 10)}  ${proposal.amountSats} sats`)
      lines.push(`  ${proposal.memo}`)
      lines.push(`  Payee ${shortKey(proposal.payeeIdentityKey, 10)}`)
      lines.push(`  Approved by ${who}`)
      lines.push(`  txid ${proposal.txid ?? ''}`)
      lines.push('')
    }
    lines.push(`Total ${total} sats`)
  }

  const content = lines
    .slice(0, 40)
    .map((line, index) => `BT /F1 11 Tf 48 ${760 - index * 16} Td (${pdfEscape(line)}) Tj ET`)
    .join('\n')
  const contentBytes = encodeUtf8(content)

  const objects = [
    encodeUtf8('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'),
    encodeUtf8('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n'),
    encodeUtf8('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n'),
    concatBytes([
      encodeUtf8(`4 0 obj << /Length ${contentBytes.length} >> stream\n`),
      contentBytes,
      encodeUtf8('\nendstream\nendobj\n')
    ]),
    encodeUtf8('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n')
  ]

  let body = encodeUtf8('%PDF-1.4\n')
  const offsets = [0]
  const chunks = [body]
  let length = body.length
  for (const object of objects) {
    offsets.push(length)
    chunks.push(object)
    length += object.length
  }
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
  for (const offset of offsets.slice(1)) {
    xrefLines.push(`${String(offset).padStart(10, '0')} 00000 n `)
  }
  chunks.push(encodeUtf8(`${xrefLines.join('\n')}\n`))
  chunks.push(encodeUtf8(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`))
  return concatBytes(chunks)
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(treasury: Treasury, yearMonth: string): void {
  const csv = paymentsCsv(treasury, yearMonth)
  downloadBytes(
    `${treasury.name.replace(/\s+/g, '-')}-${yearMonth}.csv`,
    encodeUtf8(csv),
    'text/csv;charset=utf-8'
  )
}

export function downloadPdf(treasury: Treasury, yearMonth: string): void {
  downloadBytes(
    `${treasury.name.replace(/\s+/g, '-')}-${yearMonth}.pdf`,
    paymentsPdf(treasury, yearMonth),
    'application/pdf'
  )
}
