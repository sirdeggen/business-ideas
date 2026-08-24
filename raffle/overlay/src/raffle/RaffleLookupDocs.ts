export default `# ls_raffle

Lookup index of raffle headers, tickets, and draws.

Query \`POST /lookup\` with service \`ls_raffle\`:

- \`{ "outpoint": "txid.vout" }\` — that raffle UTXO
- \`{ "raffleId": "<hex>" }\` — the raffle with that id
- \`{}\` — recent raffle outputs

Public Pages uses \`ls_anytx\` plus a client-side MAGIC filter instead.
`
