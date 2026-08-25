/** Status after a successful Spend. Names the payee; never says sats. */
export function paidLine(payeeName?: string): string {
  const name = payeeName?.trim()
  return name ? `Paid ${name}` : 'Paid.'
}
