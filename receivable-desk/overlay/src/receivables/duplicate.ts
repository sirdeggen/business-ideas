export class DuplicateInvoiceError extends Error {
  readonly invoiceId: string

  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} is already registered`)
    this.name = 'DuplicateInvoiceError'
    this.invoiceId = invoiceId
  }
}
