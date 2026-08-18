export default `# tm_records

Admits signed field readings encoded as BRC-48 PushDrop outputs.

Each live record is one UTXO. The topic manager admits **post** transactions
that create one or more valid records (magic, schema version, hash, name,
kind, note, timestamp, optional lat/lon) and rejects junk PushDrop data.

Public Pages uses \`tm_anytx\` instead. This topic is for local Docker only.
`
