import type { JoinedSession, SessionInvoice } from './protocol'

export function bookJson(book: SessionInvoice | JoinedSession): string {
  return JSON.stringify({
    sessionId: book.sessionId,
    label: book.label,
    payerIdentity: book.payerIdentity,
    payeeIdentity: book.payeeIdentity,
    payerName: book.payerName,
    payeeName: book.payeeName,
    dueDate: book.dueDate,
    createdAt: book.createdAt,
    status: book.status,
    totalSats: book.totalSats,
    lineItems: book.lineItems.map((line) => ({
      label: line.label,
      amountSats: line.amountSats,
      amountUsd: line.amountUsd,
      receiptHash: line.receiptHash
    }))
  }, null, 2)
}

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function bookCsv(book: SessionInvoice | JoinedSession): string {
  const header = ['label', 'amountUsd', 'amountSats', 'receiptHash']
  const rows = book.lineItems.map((line) => [
    csvCell(line.label),
    csvCell(line.amountUsd),
    csvCell(line.amountSats),
    csvCell(line.receiptHash)
  ].join(','))
  return [header.join(','), ...rows].join('\n') + '\n'
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
