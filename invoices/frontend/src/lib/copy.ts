import { formatUsd } from './money'
import { todayIsoDate } from './config'
import type { OverlayInvoice } from './overlay'

export type UiStatus = 'unpaid' | 'processing' | 'paid' | 'overdue'

export function humanReceiptId(invoiceId: string): string {
  const compact = invoiceId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase()
  if (compact.length < 8) return 'INV-0000-0000'
  return `INV-${compact.slice(0, 4)}-${compact.slice(4, 8)}`
}

export function localDateFromIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function formatDueLong(isoDate: string): string {
  return localDateFromIso(isoDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

export function duePhrase(isoDate: string): string {
  const due = localDateFromIso(isoDate)
  const today = localDateFromIso(todayIsoDate())
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return `was due ${formatDueLong(isoDate)}`
  if (diffDays === 0) return 'due today'
  if (diffDays === 1) return 'due tomorrow'
  if (diffDays < 7) {
    return `due ${due.toLocaleDateString('en-US', { weekday: 'long' })}`
  }
  return `due ${formatDueLong(isoDate)}`
}

export function formatPaidAt(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function invoiceStatus(invoice: OverlayInvoice, processing: boolean): UiStatus {
  if (invoice.status === 'paid') return 'paid'
  if (processing) return 'processing'
  if (invoice.status === 'open' && invoice.dueDate < todayIsoDate()) return 'overdue'
  return 'unpaid'
}

export function statusLabel(status: UiStatus): string {
  if (status === 'unpaid') return 'Unpaid'
  if (status === 'processing') return 'Processing'
  if (status === 'paid') return 'Paid'
  return 'Overdue'
}

export function statusWordClass(status: UiStatus | 'draft' | 'missing'): string {
  if (status === 'paid') return 'status-word paid'
  if (status === 'overdue') return 'status-word overdue'
  if (status === 'processing') return 'status-word processing'
  if (status === 'draft') return 'status-word draft'
  if (status === 'missing') return 'status-word'
  return 'status-word unpaid'
}

export function displayAmount(invoice: OverlayInvoice): string {
  if (invoice.amountUsd) return formatUsd(invoice.amountUsd)
  return ''
}

export function moneyActionLabel(verb: 'Send' | 'Pay', usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return verb
  return `${verb} ${formatUsd(usd)}`
}

/** Due line only. Do not repeat billed-to — that name already lives in the body. */
export function unpaidHeadline(invoice: OverlayInvoice, status: UiStatus): string {
  const due = duePhrase(invoice.dueDate)
  if (status === 'overdue' && !invoice.billedTo) {
    return `Waiting on the payer. ${due}.`
  }
  return due
}
