export default `# tm_invoices

Admits BSV payable invoices encoded as BRC-48 PushDrop outputs.

An invoice is a first-class on-chain object (payee identity, amount in sats, memo, due date). The topic manager:

- admits **create** transactions that mint new unique invoice ids into the overlay
- admits **pay** transactions that include a BRC-29 payment output of the billed satoshis plus a PushDrop receipt bound to that invoice id
- accepts **void** spends that consume an unpaid invoice with no replacement
- rejects malformed PushDrop data, receipts whose payment output is the wrong amount, and mixed create/pay in one transaction

Paid vs open is queryable through \`ls_invoices\`. That lookup service is what rejects a second pay for the same invoice id. This is BSV only — not Request Finance on 18 chains.
`
