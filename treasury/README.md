# Policy treasury (v0)

A grassroots BSV treasury that is not one person’s wallet. Treasurer, chair, and bookkeeper (or treasurer + chair) run a **2-of-3** (or **2-of-2**) vault. **Keys stay in BSV Desktop or BSV Browser.** This app does not custody keys, issue a token, talk to EVM, Stripe, Lightning, or SSO.

This folder is self-contained. Do not look for a shared index change here — that belongs to the Pages catalog.

## Read a board (no wallet)

A board URL is minutes first. Overlay lookup is flaky — the UI retries `ls_anytx`, keeps last-good minutes in localStorage, and never replaces a known book with “Nothing yet” because overlay blinked.

Example (Demo Club, readable without connecting):

https://sirdeggen.github.io/business-ideas/treasury/?treasury=fd99a97b-0415-4036-909d-ca7794a70f04

After create, the invite is `?treasury=<id>&tx=<createdTxid>` so `ls_anytx { txid }` can find the announcement even when the global firehose is empty. `?treasury=<id>` alone still works: retry, page, date window, then last-good cache.

What a stranger sees on `?treasury=` (first screen, in this order):

- Board name
- Minutes (propose, approve, paid) in plain language
- Open proposals with Approve / Decline — wallet is requested **after** Approve (or Decline)
- Honest overlay status: checking / online / lookup failed (minutes may be cached)

Fund, vault balance, Propose, and identity-key fields are **not** on that screen. They mount only after **Treasurer tools** is opened. Do not lead with a dead Fund or “0 sats.”

Empty states (never a fake empty book while lookup is in flight or failed):

- checking: “Looking up minutes on overlay-us-1…”
- failed: “Could not reach overlay-us-1. Minutes are not missing — lookup failed.”
- confirmed empty: “No minutes for this board yet.”

Create / Join / Fund / Propose / Broadcast pay live under **Treasurer tools**. They are not the first screen on a board URL. Amounts are dollars (same pattern as invoices). Identity keys sit under Advanced.

## Invite-first (after create)

1. Copy invite is the next step.
2. Fund stays disabled until every required seat has joined (2-of-2 / 2-of-3 only). The disabled button shows tooltip + inline “Invite chair and bookkeeper first.”
3. No 1-of-1 pending vault. `p2msLock` remains 2-of-2 / 2-of-3.
4. Propose stays blocked until the vault is funded.

One wallet may hold more than one seat. Threshold counts **roles**, so treasurer+chair on the same identity can still Approve / Sign vault once per remaining role.

## Public path (no Docker)

GitHub Pages is static. Shared board state is **not** an Express process.

| Service | Host | What it is for |
| --- | --- | --- |
| Overlay | `https://overlay-us-1.bsvb.tech` | Public minutes. Topic `tm_anytx`, lookup `ls_anytx`. |
| Message Box | `https://gmb.bsvblockchain.tech` | Signer-to-signer propose / approve. Box name `policy treasury`. |

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
3. kind: `created` \| `joined` \| `funded` \| `proposed` \| `approved` \| `declined` \| `paid`
4. JSON payload (role, keys, amount, memo, proposal id, signatures, vault outpoint, BEEF hex, …)

On-chain / overlay payloads can still store satoshis. The UI leads with dollars. Decline is a board event only — it does not broadcast a vault spend. Pay stays in treasurer tools and only runs when someone explicitly clicks it after the threshold is met.

Protocol ID for the announcement lock is `[0, "policy treasury"]` (Silent) so these tokens do not spam the wallet. After `createAction`, the tx is broadcast with `TopicBroadcaster(['tm_anytx'])` pinned at overlay-us-1. If SHIP host discovery fails, the client POSTs raw BEEF to `https://overlay-us-1.bsvb.tech/submit` with `x-topics: ["tm_anytx"]`.

`ls_anytx` has no protocol filter. The UI queries `{ txid }` when the invite carries one, then `{ limit, skip, sortOrder: "desc" }` (and a date window), decodes each locking script with `PushDrop.decode`, and keeps tokens whose first field is `policy treasury`. A known `?treasury=` id that comes back empty is retried. Last-good minutes stay in localStorage.

Propose and approve are also sent through `MessageBoxClient` (`messageBox: "policy treasury"`) so the other signers see pending work without paging the whole anytx index. If Message Box is down, overlay events remain the source of truth.

## What you can do

1. Open a board URL and read minutes (no wallet).
2. Approve or Decline an open proposal (wallet after the click).
3. Under Treasurer tools: create, invite, join, fund, propose, sign the vault, broadcast pay, export.

## How the 2-of-3 actually works (verified, not a fake Safe)

There is no Solidity account and no `@bsv/sdk` FROST/MuSig helper. The smallest real path:

| Layer | What it is |
| --- | --- |
| Named roles | Treasurer, chair, bookkeeper identity keys (`getPublicKey({ identityKey: true })`). |
| On-chain vault | [BRC-47](https://bsv.brc.dev/scripts/0047) bare **P2MS**: `OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG`. Unchanged. |
| Keys in that script | BRC-42 children of each identity: `getPublicKey({ protocolID: [1, "policy treasury"], keyID: treasuryId, counterparty: "self" })` when each seat is a different wallet. If one identity holds a second or third seat, those extra seats use `keyID: ${treasuryId}:${role}` so P2MS can collect two distinct pubkeys. |
| Board approvals | BRC-100 `createSignature({ data })` over a canonical proposal JSON. |
| Spend | After two approvals, two signers `createSignature({ data: sha256(preimage) })` so the wallet’s extra SHA-256 yields HASH256(preimage). Unlocking script is `OP_0 <sig> <sig>`. One `createAction` broadcasts — only from treasurer tools, only after an explicit pay click. |
| Payee | PushDrop / BRC-29 lock to the payee’s identity key. The board shows a name; hex stays under Advanced. |
| Public minutes | 1-sat PushDrop announcements on `tm_anytx` / `ls_anytx` at overlay-us-1. |
| Signer inbox | `@bsv/message-box-client` at gmb.bsvblockchain.tech. |

The app never holds a spending key. Funded / paid announcements carry BEEF hex so the next signer can assemble a spend without the vault UTXO living in `ls_anytx`.

## Optional local fallback (Docker / Express)

The Dockerized Express feed is **optional**. It is not required to read or write the public board.

```bash
cd treasury
docker compose up --build
```

```bash
cd treasury/server
npm install
DATA_DIR=./data npm run dev   # :8080, optional
```

## Stack

- Wallet: BRC-100 `WalletClient` via `@bsv/simple/browser` `createWallet()`, fallback `new WalletClient('auto', originator)` + `waitForAuthentication`.
- Script: `@bsv/sdk` `LockingScript` / `OP_CHECKMULTISIG` / `TransactionSignature` / `PushDrop`.
- Overlay: `LookupResolver` + `TopicBroadcaster` pinned at `https://overlay-us-1.bsvb.tech` (`tm_anytx` / `ls_anytx`).
- Inbox: `MessageBoxClient` from `@bsv/message-box-client` at `https://gmb.bsvblockchain.tech`.
- Dollars: Whatsonchain then CoinGecko (no invented rate). Convert to sats only at the wallet/script boundary.
- Tests: ProtoWallet 2-of-3 spend; invite-first Fund gate; role-threshold approve; lookup empty-state copy; money helpers with a fixture rate (no live network).

```bash
cd treasury/server && npm test
```

## Blockers / honest limits

- Wallets must implement `createSignature` with `data` (BRC-100). If a wallet cannot sign a vault sighash that way, approvals still work and the spend button will error — that is a wallet-capability gap, not a hidden custodian.
- `ls_anytx` is a global any-PushDrop index and it blinks. Retry + last-good cache are how a stranger with only `?treasury=<uuid>` still sees minutes.
- Message Box is a convenience inbox. If gmb is down, overlay events are still the public minutes.
- The vault UTXO is not in `ls_anytx`. Later signers need the BEEF hex from the `funded` / `paid` announcement (or the local cache) to assemble a spend.
- GitHub Pages is static. That is why the public path is overlay + Message Box, not Express.

Identity keys are 66-hex compressed pubkeys. **Never commit private keys.**
