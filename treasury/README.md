# Policy treasury (v0)

A grassroots BSV treasury that is not one person’s wallet. Treasurer, chair, and bookkeeper (or treasurer + chair) run a **2-of-3** (or **2-of-2**) vault. The app proposes payments. **Keys stay in BSV Desktop or BSV Browser.** This server does not custody keys, issue a token, talk to EVM, Stripe, Lightning, or SSO.

This folder is self-contained. Do not look for a shared index change here — that belongs to the Pages catalog.

## What you can do

1. Create a named 2-of-3 (or 2-of-2) treasury.
2. Invite the other signers. They join with their identity keys.
3. Fund the vault.
4. Propose a payment: amount (sats), payee identity key, memo.
5. Signers approve. When the threshold is met, they sign the vault spend and the payment goes out.
6. Export a month of payments as CSV or PDF.

## How the 2-of-3 actually works (verified, not a fake Safe)

There is no Solidity account and no `@bsv/sdk` FROST/MuSig helper. The smallest real path:

| Layer | What it is |
| --- | --- |
| Named roles | Treasurer, chair, bookkeeper identity keys (`getPublicKey({ identityKey: true })`). |
| On-chain vault | [BRC-47](https://bsv.brc.dev/scripts/0047) bare **P2MS**: `OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG`. |
| Keys in that script | BRC-42 children of each identity: `getPublicKey({ protocolID: [1, "policy treasury"], keyID: treasuryId, counterparty: "self" })`. Same idea as ts-stack `P2MSKH`, which uses `[1, "multi sig brc29"]`. |
| Board approvals | BRC-100 `createSignature({ data })` over a canonical proposal JSON. Signed with the same treasury child key (`keyID: treasuryId`), not a per-proposal key. |
| Spend | After two approvals, two signers `createSignature({ data: sha256(preimage) })` so the wallet’s extra SHA-256 yields HASH256(preimage) — the [PushDrop](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/src/script/templates/PushDrop.ts) trick. Unlocking script is `OP_0 <sig> <sig>`. One `createAction` broadcasts. |
| Payee | PushDrop / BRC-29 lock to the payee’s identity key, computed by the proposer so every signer hashes the same output. Not a Bitcoin address. |

**Hypothesis, labeled:** a server that collected BRC-100 signatures and then spent from *one person’s* wallet would be smaller, but it would still be one person’s coins. P2MS is the actual multi-party lock. Threshold signatures (FROST) are not in `@bsv/sdk` v2. overlay-express is the right indexer for **UTXOs**, not for proposals/approvals (those are not outputs). It also needs MySQL + Mongo. v0 therefore uses a Dockerized Express board feed that *looks* like minutes of a meeting. A later overlay topic could index vault UTXOs.

The feed process never holds a spending key. It stores public keys, proposal metadata, DER signatures, and BEEF for the vault UTXO so the next signer can assemble the spend.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser)
- Node 22+ (local) or Docker + Docker Compose

Identity keys are 66-hex compressed pubkeys. Put optional **public** keys in env if you already know the board. **Never commit private keys.**

```bash
# treasury/.env.example — public keys only, if you want to pre-fill seats
# TREASURER_IDENTITY_KEY=
# CHAIR_IDENTITY_KEY=
# BOOKKEEPER_IDENTITY_KEY=
```

## Create, invite, propose, approve, pay, export

Docker Compose is the default:

```bash
cd treasury
docker compose up --build
```

- Board feed: http://localhost:8080 (`GET /health`, `GET /treasuries/:id/feed`, CSV/PDF export)
- UI: http://localhost:5173

### Frontend only (against a running feed)

```bash
cd treasury/server
npm install
DATA_DIR=./data npm run dev   # :8080

cd ../frontend
npm install
npm run dev                   # Vite :5173
```

### The 2-of-3 flow

1. **Treasurer** connects a BSV wallet. Create a treasury named for the club. Optionally paste the chair and bookkeeper identity keys (or leave blank). Copy the invite link (`?treasury=<id>`).
2. **Chair** and **bookkeeper** each open the link, connect *their* wallet, click **Join**. When both have joined, the P2MS vault script is live.
3. Anyone with sats clicks **Fund from this wallet** and approves `createAction`. Coins lock to the 2-of-3 script (basket `treasury`).
4. A signer **proposes**: sats, payee identity key, memo. Their wallet signs the proposal.
5. A second signer clicks **Approve**. Threshold is met. Each of two signers clicks **Sign vault spend** (Bitcoin sighash, still via WalletClient). Then **Broadcast pay**.
6. **Export** CSV or PDF for the month (`YYYY-MM`). A non-technical board can also just read the feed.

2-of-2: create with “treasurer, chair” only. Both must approve.

## Stack

- Wallet: BRC-100 `WalletClient` via `@bsv/simple/browser` `createWallet()`, fallback `new WalletClient('auto', originator)` + `waitForAuthentication`.
- Script: `@bsv/sdk` `LockingScript` / `OP_CHECKMULTISIG` / `TransactionSignature` / `PushDrop`.
- Feed: Express + JSON file. Dockerfile at `treasury/Dockerfile`.
- Tests: ProtoWallet 2-of-3 spend validates in the script interpreter; HTTP flow covers propose → approve → CSV/PDF.

```bash
cd treasury/server && npm test
```

## Blockers / honest limits

- Wallets must implement `createSignature` with `data` (BRC-100). If a wallet cannot sign a vault sighash that way, approvals still work and the spend button will error — that is a wallet-capability gap, not a hidden custodian.
- `createAction` with a foreign P2MS input and a complete unlocking script is the broadcast path. Some wallets may try to add fee inputs from the connected user; the vault already pays a 100-sat fee.
- GitHub Pages is static. This app is the feed server + UI, same class as the 402 folders, not a Pages demo.
- overlay-express is not stood up here on purpose (see hypothesis above).
