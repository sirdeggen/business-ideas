export default `# tm_tickets

Admits Demo Night event tickets encoded as BRC-48 PushDrop outputs.

Each live ticket is one UTXO. The topic manager:

- admits **mint** transactions that create N new tickets for event \`demonight\`
- admits **transfer** spends that recreate the same event+serial for a new owner
- accepts **redeem** spends that consume a ticket and create no replacement (the ticket leaves the overlay)
- rejects malformed PushDrop data, the wrong event, serial changes on transfer, and duplicate serials in a mint

Already-spent tickets are removed from the lookup index, so door lookup of that outpoint fails.
`
