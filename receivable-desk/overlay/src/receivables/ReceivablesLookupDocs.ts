export default `# ls_receivables

Lookup index of receivable-desk invoices.

Query \`POST /lookup\` with service \`ls_receivables\`:

- \`{ "outpoint": "txid.vout" }\` — current UTXO for that receipt
- \`{ "invoiceId": "INV-2026-001" }\` — that invoice, or empty
- \`{ "status": "open" | "approved" | "paid" | "unpaid" }\`
- \`{ "creditor": "<66-hex identity>" }\` / \`{ "debtor": "<66-hex identity>" }\`
- \`{ "approvedUnpaid": true }\` — credit-partner book (approved, not paid)
- \`{}\` — recent invoices

Duplicate invoice ids are rejected at storage. Paid markers stay in the index so a second register of the same id fails.
`
