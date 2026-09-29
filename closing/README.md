# Closing Desk (v0)

A shared record of a purchase closing in sats. A changed payee is flagged on the receipt.

A buyer opens one purchase closing. The shared record names a bound payee, a deed or document hash, and a seller attestation. The release receipt is written only after the parties approve. The fee is basis points of the closing amount (default 100). A payee change needs those same parties, plus an optional flat amendment fee, and it clears release approvals already given. The receipt flags that change. One person sending new wire instructions is rejected.

v0 records and attests a shared closing receipt. It does not move funds. The walkthrough stores the closing in the browser. Quorum and approvals are a local simulation: unsigned clicks on a role, not wallet signatures. The overlay records only the open, the deed, the attestation, and the release. Party pubkeys are derived from the name, `02` plus the SHA-256 of the name, not real keys.

This is **not** the job desk (those wait until a deliverable hash lands) and **not** Handoff Desk (those list a digital asset for a secondary handoff). One high-value purchase closing.

Product gaps this desk shows, from Texas oil and mineral wire-fraud research: last-minute payee changes and fake wire instructions (royalty diversion ~$1.5M in a documented Midland case; vendor BEC ~$186k).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. The walkthrough runs in the page with no wallet. **Record this closing** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), and keeps only this app’s PushDrop fields (MAGIC `closing`). No custom topic. The record output is a 1-sat receipt carrying the bound payee, deed hash, seller attestation, the fee lines, and both the first payee and the current payee when those differ. v0 records and attests; that output does not move the closing amount.

Message Box at `https://gmb.bsvblockchain.tech` (box `closing`) is an optional nudge when the receipt is recorded. Overlay is the public book.

Public UI: `https://sirdeggen.github.io/business-ideas/closing/`

Deep links are query params: `?c=<closingId>&tx=<txid>`. Do not use a path like `/c/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record this closing**.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only after the closing is released.
- Identity: names sit on the face. Keys stay under Advanced. Those pubkeys are derived from the name, `02` plus the SHA-256 of the name, not real keys. Approvals and the seller attestation are unsigned clicks on a role, not wallet signatures.
- State: quorum and approvals are a local simulation. The overlay records only the open, the deed, the attestation, and the release. Wallet basket `closing`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `closing`).
- Encoding: PushDrop fields — open (label, amount, fee in basis points, bound payee, parties, threshold), deed hash, seller attestation, release (fee sats, amendment fee, net to payee).
- Fee: default 100 basis points of the closing amount, `floor(amount × bps / 10000)`. Optional flat amendment fee, applied only when a payee change is approved.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Name the purchase, enter a closing amount in sats, leave the fee at 100 basis points (1%). Seller and, if you want, a closing agent. Click **Open the closing**. The receipt names that payee. No wallet.
3. Paste deed text or pick a file. **Attach the deed**. **Check the hash**. **Seller attests**. The page shows whether the hash matches and whether the attestation matches.
4. Type a new payee and click **Swap the payee**. The attempt is rejected. The bound payee does not change.
5. Two parties **Approve** the change. The payee updates, and the receipt flags the change. If you set an amendment fee, it shows on the lines. Release approvals from before the change are cleared.
6. Two parties approve the release again. **Release**. The lines show closing amount, fee in basis points, fee sats, and net to payee. If the payee changed, the receipt still flags it. That release is an attested receipt. It does not move funds.
7. **Record this closing** asks for the wallet and writes the receipt to `tm_anytx`. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd closing/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5185.

### Tests

```bash
cd closing/frontend
npm test
npm run build
```

Bound payee, rejected unilateral swap, M-of-N payee change, deed hash plus seller attestation, release fee lines at 100 bps, encode/decode, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet, no Install Desktop until a wallet failure). Deep links use `?c=` not `/c/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `closing` |
| Protocol ID | `[0, "closing"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `closing`) |
| Protocol string | `closing` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `closing`) |
| Fee | 100 bps default |
| Approvals | 2 of 2, or 2 of 3 when a closing agent is included. Local simulation; not an overlay record |
| Record output | 1 sat receipt |

## Layout

```
closing/
  protocol/          field encode/decode + closing rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
