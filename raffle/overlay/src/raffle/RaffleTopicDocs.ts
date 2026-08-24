export default `# tm_raffle

Admits raffle headers, tickets, and draw announcements encoded as BRC-48
PushDrop outputs.

Each live ticket is one UTXO. Start creates a header. Claim creates a ticket.
Transfer spends a ticket and recreates it for a new holder. Draw announces a
winner. Junk PushDrop data is rejected.

Public Pages uses \`tm_anytx\` instead. This topic is for local Docker only.
`
