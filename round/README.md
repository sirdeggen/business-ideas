# Round Desk (v0)

A local business, co-op, or startup runs its own raise. Backers prove eligibility with BRC-52/53 certificates by disclosing only the fields that raise asked for. v0 escrow is issuer custody: the issuer’s wallet funds every commitment into one UTXO escrow that has a minimum, a maximum, and a deadline. Backers do not fund or sign those outputs. Only the issuer can spend them, and there is no on-chain refund path. The price is either fixed or a clearing-price auction. If the raise is still under the minimum when the deadline passes, a refund is computed for every backer and recorded. It is not spent. If it is oversubscribed, the allocation is computed in the open. On a settled close, the holdings hand off to Registry Desk. There is no token market and no secondary trading.

What the script enforces: each commitment output is a PushDrop lock. The key id is `escrow-<roundId>` and the counterparty is `anyone`, so any reader re-derives the locking key from the issuer’s public identity key alone and checks it against the locking public key. Only the issuer wallet can spend that key. **Record on the public book** is the issuer’s `createAction`. It funds that same lock, one output per commitment, for the commitment amount. The copy does not treat any other script as holding the raise. A backer-funded output, with a refund spend the backer can sign and a release the issuer can sign, is not in v0.

What is computed and recorded: which certificate fields were disclosed, whether the raise met its minimum, the fixed price or the clearing price, who is filled up to the maximum, the refund of everyone else, and the Registry Desk handoff. A public record counts only when the key derived from the issuer identity signed it with BRC-100 `createSignature`, counterparty `anyone`. The round id is `sha256(issuerKey || nonce)`. A commit id is `sha256(backerKey || nonce)`. Readers recompute both and drop mismatches. They also recompute the allocation and drop a close that does not match. OP_PUSH_TX enforcement of the minimum, the maximum, the deadline, and the refund outputs is v1 work. v0 does not pretend the locking script forced those payouts.

A time written into a record does not order commits or decide the deadline. On the public book the transaction does. Admission time comes from the overlay host’s lookup context. The desk trusts that host. The context is not a merkle proof and not a block header. When the host sends no time, the raise stays pending. It is not read as a refund. A commitment stated before the deadline does not count when its own transaction time is after the deadline. The walkthrough clock is only a local preview. The issuer’s wallet sets `nLockTime` to the moment of recording. It is not the backer’s clock. Final sequence numbers mean that lock time does not hold the transaction. A lock time at or after the deadline only proves the issuer’s transaction was not earlier than that moment. A lock time before the deadline does not prove the commitment was early.

This is not Registry Desk (the book the holdings are handed to). This is not Keepsake (a numbered edition you can resell). This is not Bounty (a severity-tiered pool). This is not a token listing. The desk has no transfer and no resale.

The walkthrough stores the raise in the browser. No wallet on first paint. Open, disclose, commit, and close all run locally. **Record on the public book** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `round`).

Public UI: `https://sirdeggen.github.io/business-ideas/round/`

Deep links are query params: `?r=<roundId>&tx=<txid>&p=<identityKey>`. `?tx=` names the canonical terms transaction. `?p=` pins an issuer identity key and drops raises from every other key. Do not use a path like `/r/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record on the public book**. Install Desktop appears only if that wallet is missing.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `createSignature` via the visitor’s Desktop, and only when recording.
- State: the raise is a local walkthrough until you record. Wallet basket `round`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `round`).
- Encoding: PushDrop fields — terms (minimum, maximum, deadline, price), eligibility (only the disclosed fields), commit (escrow sats), close (refund or allocation, plus the register id).
- Signatures: BRC-100 `createSignature`, protocol `[0, "round"]`, key id `round`, counterparty `anyone`.
- Escrow: key id `escrow-<roundId>`, counterparty `anyone`, derived from the issuer identity.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Name the raise. Leave the co-op, the fixed price, the minimum, the maximum, and the deadline. Leave jurisdiction and member checked. Click **Open the raise**. No wallet.
3. Name the backer and fill only those fields. Click **Prove eligibility**.
4. Enter a commitment and click **Commit to escrow**. Add another backer the same way if you want to show an oversubscribed raise.
5. Click **Close the raise**. Under the minimum, a refund is computed for every backer and is not spent. Otherwise the page shows the allocation and a register handoff. There is no resale.
6. **Record on the public book** asks for the issuer's wallet. It signs every record with counterparty `anyone`. The issuer's `createAction` funds each commitment and sets `nLockTime`. Backers do not fund or sign those outputs, and v0 has no on-chain refund spend. Sample backer names are not wallet keys. OP_PUSH_TX enforcement of the computed payouts is v1 work.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd round/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5189.

### Tests

```bash
cd round/frontend
npm test
npm run build
```

Key-bound ids, selective disclosure, fixed-price and clearing-price allocation, automatic refund under the minimum, registry handoff with no transfer, signatures with counterparty `anyone`, MAGIC `round` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?r=` not `/r/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `round` |
| Protocol ID | `[0, "round"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `round`) |
| Protocol string | `round` |
| Round id | `sha256(issuerKey \|\| nonce)` |
| Commit id | `sha256(backerKey \|\| nonce)` |
| Signing | `createSignature`, key id `round`, counterparty `anyone` |
| Escrow key id | `escrow-<roundId>`, counterparty `anyone` |
| Overlay host | `https://overlay-us-1.bsvb.tech` |
| Registry handoff | issue records only, no transfer |
| OP_PUSH_TX | v1. v0 does not enforce allocation in the script |

## Layout

```
round/
  protocol/          field encode/decode + raise rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
