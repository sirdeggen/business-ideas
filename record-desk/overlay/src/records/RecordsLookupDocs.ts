export default `# ls_records

Lookup index of signed field readings.

Query \`POST /lookup\` with service \`ls_records\`:

- \`{ "outpoint": "txid.vout" }\` — that record UTXO
- \`{ "hash": "<64-hex>" }\` — the record with that hash
- \`{}\` — recent records

Public Pages uses \`ls_anytx\` plus a client-side MAGIC filter instead.
`
