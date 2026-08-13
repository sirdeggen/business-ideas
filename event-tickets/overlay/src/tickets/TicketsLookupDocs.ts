export default `# ls_tickets

Lookup index of live Demo Night tickets.

Query \`POST /lookup\` with service \`ls_tickets\`:

- \`{ "outpoint": "txid.vout" }\` — live ticket at that UTXO, or empty if spent/never admitted
- \`{ "serial": "3" }\` — live tickets with that serial
- \`{ "eventId": "demonight" }\` — live tickets for the demo event
- \`{}\` — recent live tickets

Spent tickets are deleted from this index.
`
