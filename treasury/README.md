# Policy treasury (v0)

A grassroots BSV treasury that is not one person’s wallet. Treasurer, chair, and bookkeeper (or treasurer + chair) run a **2-of-3** (or **2-of-2**) vault. The app proposes payments. **Keys stay in BSV Desktop or BSV Browser.** This app does not custody keys, issue a token, talk to EVM, Stripe, Lightning, or SSO.

This folder is self-contained. Do not look for a shared index change here — that belongs to the Pages catalog.

## Public path (no Docker)

GitHub Pages is static. Shared board state is **not** an Express process.

| Service | Host | What it is for |
| --- | --- | --- |
| Overlay | `https://overlay-us-1.bsvb.tech` | Public minutes. Topic `tm_anytx`, lookup `ls_anytx`. |
| Message Box | `https://gmb.bsvblockchain.tech` | Signer-to-signer propose / approve. Box name `policy treasury`. |

1. Open the UI (Pages, `treasury/frontend` Vite, or any static host).
2. Read a board at `?treasury=<id>` — lookup only, no wallet.
3. Connect a BSV wallet to create, join, fund, propose, approve, or pay.

```bash
cd treasury/frontend
npm install
npm run dev
```

Vite `base` is `./`, so `npm run build` works on GitHub Pages or any static host. The built UI talks to overlay-us-1 and gmb, never `localhost:8080`.

### How minutes are stored

`tm_anytx` only admits valid PushDrop outputs. The P2MS vault UTXO is **not** a PushDrop, so vault coins do not appear in `ls_anytx`. Every board action publishes a **1-sat PushDrop announcement**. Fields (utf8):

1. `policy treasury` — client-side filter tag
2. treasury id
3. kind: `created` \| `joined` \| `funded` \| `proposed` \| `approved` \| `paid`
4. JSON payload (role, keys, amount, memo, proposal id, signatures, vault outpoint, BEEF hex, …)

Protocol ID for the announcement lock is `[0, "policy treasury"]` (Silent) so these tokens do not spam the wallet. After `createAction`, the tx is broadcast with `TopicBroadcaster(['tm_anytx'])` pinned at overlay-us-1. If SHIP host discovery fails, the client POSTs raw BEEF to `https://overlay-us-1.bsvb.tech/submit` with `x-topics: ["tm_anytx"]`.

`ls_anytx` has no protocol filter. The UI queries `{ limit, skip, sortOrder: "desc" }`, decodes each locking script with `PushDrop.decode`, and keeps tokens whose first field is `policy treasury`. Treasury state is reconstructed from that event list. CSV / PDF export runs in the browser from the same object.

Propose and approve are also sent through `MessageBoxClient` (`messageBox: "policy treasury"`) so the other signers see pending work without paging the whole anytx index. If Message Box is down, overlay events remain the source of truth.

## What you can do

1. Create a named 2-of-3 (or 2-of-2) treasury.
2. Invite the other signers. They join with their identity keys.
3. Fund the vault.
4. Propose a payment: amount (sats), payee identity key, memo.
5. Signers approve. When the threshold is met, they sign the vault spend and the payment goes out.
6. Export a month of payments as CSV or PDF (in the browser).

## How the 2-of-3 actually works (verified, not a fake Safe)

There is no Solidity account and no `@bsv/sdk` FROST/MuSig helper. The smallest real path:

| Layer | What it is |
| --- | --- |
| Named roles | Treasurer, chair, bookkeeper identity keys (`getPublicKey({ identityKey: true })`). |
| On-chain vault | [BRC-47](https://bsv.brc.dev/scripts/0047) bare **P2MS**: `OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG`. Unchanged. |
| Keys in that script | BRC-42 children of each identity: `getPublicKey({ protocolID: [1, "policy treasury"], keyID: treasuryId, counterparty: "self" })`. Same idea as ts-stack `P2MSKH`, which uses `[1, "multi sig brc29"]`. |
| Board approvals | BRC-100 `createSignature({ data })` over a canonical proposal JSON. Signed with the same treasury child key (`keyID: treasuryId`), not a per-proposal key. |
| Spend | After two approvals, two signers `createSignature({ data: sha256(preimage) })` so the wallet’s extra SHA-256 yields HASH256(preimage) — the [PushDrop](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/src/script/templates/PushDrop.ts) trick. Unlocking script is `OP_0 <sig> <sig>`. One `createAction` broadcasts. |
| Payee | PushDrop / BRC-29 lock to the payee’s identity key, computed by the proposer so every signer hashes the same output. Not a Bitcoin address. |
| Public minutes | 1-sat PushDrop announcements on `tm_anytx` / `ls_anytx` at overlay-us-1. Not a custom topic. |
| Signer inbox | `@bsv/message-box-client` at gmb.bsvblockchain.tech. Not a custom overlay. |

The app never holds a spending key. Funded / paid announcements carry BEEF hex so the next signer can assemble a spend without the vault UTXO living in `ls_anytx`.

## Optional local fallback (Docker / Express)

The Dockerized Express feed is **optional**. It is not required to read or write the public board. Use it only if you want a private JSON store on your laptop.

```bash
cd treasury
docker compose up --build
```

- Optional feed: http://localhost:8080
- UI: http://localhost:5173 (still talks to overlay-us-1 + gmb, not the feed)

```bash
cd treasury/server
npm install
DATA_DIR=./data npm run dev   # :8080, optional
```

## The 2-of-3 flow

1. **Treasurer** connects a BSV wallet. Create a treasury named for the club. Optionally paste the chair and bookkeeper identity keys (or leave blank). Copy the invite link (`?treasury=<id>`).
2. **Chair** and **bookkeeper** each open the link (readable without a wallet), connect *their* wallet, click **Join**. When both have joined, the P2MS vault script is live.
3. Anyone with sats clicks **Fund from this wallet** and approves `createAction` once every seat has joined. Until then Fund stays disabled and says to invite chair and bookkeeper first — there is no 1-of-1 pending vault. A 1-sat announcement records the outpoint + BEEF.
4. A signer **proposes**: sats, payee identity key, memo. Their wallet signs the proposal. The event goes to overlay and Message Box.
5. A second signer clicks **Approve**. Threshold is met. Each of two signers clicks **Sign vault spend** (Bitcoin sighash, still via WalletClient). Then **Broadcast pay**. The paid announcement is a *separate* 1-sat tx — the P2MS spend itself is not a PushDrop.
6. **Export** CSV or PDF for the month (`YYYY-MM`) from the reconstructed board.

2-of-2: create with “treasurer, chair” only. Both must approve.

## Stack

- Wallet: BRC-100 `WalletClient` via `@bsv/simple/browser` `createWallet()`, fallback `new WalletClient('auto', originator)` + `waitForAuthentication`.
- Script: `@bsv/sdk` `LockingScript` / `OP_CHECKMULTISIG` / `TransactionSignature` / `PushDrop`.
- Overlay: `LookupResolver` + `TopicBroadcaster` pinned at `https://overlay-us-1.bsvb.tech` (`tm_anytx` / `ls_anytx`).
- Inbox: `MessageBoxClient` from `@bsv/message-box-client` at `https://gmb.bsvblockchain.tech`.
- Tests: ProtoWallet 2-of-3 spend validates in the script interpreter; PushDrop field encode/decode and treasury reconstruction need no live overlay.

```bash
cd treasury/server && npm test
```

## Blockers / honest limits

- Wallets must implement `createSignature` with `data` (BRC-100). If a wallet cannot sign a vault sighash that way, approvals still work and the spend button will error — that is a wallet-capability gap, not a hidden custodian.
- `createAction` with a foreign P2MS input and a complete unlocking script is the broadcast path. Some wallets may try to add fee inputs from the connected user; the vault already pays a 100-sat fee.
- `ls_anytx` is a global any-PushDrop index. The UI pages and filters client-side. Fresh announcements can take a moment to appear; the browser keeps a local cache of events it just published.
- Message Box is a convenience inbox. If gmb is down, overlay events are still the public minutes.
- The vault UTXO is not in `ls_anytx`. Later signers need the BEEF hex from the `funded` / `paid` announcement (or the local cache) to assemble a spend.
- GitHub Pages is static. That is why the public path is overlay + Message Box, not Express.

Identity keys are 66-hex compressed pubkeys. **Never commit private keys.**
