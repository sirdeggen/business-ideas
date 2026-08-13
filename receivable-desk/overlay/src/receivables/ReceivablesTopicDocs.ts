export default `# tm_receivables

Admits BSV invoice registry outputs encoded as BRC-48 PushDrop.

Each live receivable is one UTXO. The topic manager:

- admits **register** transactions that create N new invoices with unique invoice ids
- admits **approve** spends that move open → approved without changing parties, amount, or due date
- admits **settle** spends that move open|approved → paid only when a same-tx output pays the billed satoshis (BRC-29)
- admits **advance-intent** spends that stamp 70% on an approved unpaid invoice (no sats of credit move)
- rejects malformed PushDrop data, duplicate invoice ids in a register, identity/amount mutations, and spends of an already-paid marker

This overlay is a cheap public registry (Figure DART analog, invoices not houses). It does not originate credit, custody funds, or act as a bank.
`
