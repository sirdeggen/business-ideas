export default `# ls_invoices

Lookup index of payable invoices.

Query \`POST /lookup\` with service \`ls_invoices\`:

- \`{ "invoiceId": "<32 hex>" }\` — that invoice, open or paid
- \`{ "invoiceId": "<32 hex>", "forPay": true }\` — same, but **throws** if the invoice is missing or already paid (double-pay reject)
- \`{ "status": "open" }\` — unpaid invoices
- \`{ "status": "paid" }\` — settled invoices (includes payment txid)
- \`{ "payeeIdentity": "02… or 03…" }\` — invoices for that issuer
- \`{ "outpoint": "txid.vout" }\` — the create UTXO
- \`{}\` — recent invoices

A second pay for an already-paid invoice id is rejected here even if a well-formed receipt hits the topic.
`
