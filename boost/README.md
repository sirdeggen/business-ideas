# Boost Desk (v0)

Pay for a verified listing. Buy a timed boost. Ranking is on-chain.

A directory for local businesses, events, and vendors. The owner pays a profile fee once and gets a verified profile: name, category, a short blurb, an optional link, and their identity key. They can buy a 12-hour or 24-hour boost. While that window is open, the listing ranks above listings that are not boosted. When the window ends, it falls back. Every boost is a receipt on the overlay, so anyone can see why a listing is up top.

Why it exists and the demo goal below are drafts. Revandrew can re-lock those two lines later.

## Distinct from Names / KYA / Vouch / Feed

This is not Names (a name you lease). Not KYA or Vouch (trust or identity). Not Feed (pay for a signed reading). Those desks stay what they are. This one sells a listing and a timed place in the ranking.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), then keeps only this app’s PushDrop fields (MAGIC `boost`). No custom topic.

Public UI: `https://sirdeggen.github.io/business-ideas/boost/`

Deep links are query params: `?p=<profileId>&tx=<txid>`. Do not use a path like `/p/:id` — GitHub Pages 404s those.

Catalog: **Server** + **View**. Not Live. Live remains StreamPay and Grant receipt.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Buy profile** and **Buy boost**. The quote, the business case, and a `?p=` reading work with no wallet.

## What is on-chain vs attested

Real satoshi payments, via `createAction`, labeled in the wallet approval:

- **Profile fee.** 2,000 sats, paid once to the desk key. The output is labeled **Profile fee**.
- **Boost pack.** 1,000 sats for 12 hours, or 1,800 sats for 24 hours, paid to the desk key. The output is labeled **Boost pack**.

Overlay records (a public book, not custody of a ranking slot):

- The profile: category, name, blurb, optional link, owner key, desk key, the profile fee, and the owner’s signature. Verified means that owner signed the listing and the fee is named on the receipt. It is not a background check.
- The boost receipt: pack, price, start, end, and the owner’s signature. A boost signed by someone else is ignored. Ranking reads these windows. It is not a hidden placement.

v0 does **not** hold a listing, a slot, or anything beyond the fees paid to the desk key. Reading a receipt does not by itself prove the fee output was paid. The money that actually moves is the profile fee and the boost pack, each as its own labeled output.

The same owner cannot take a second row under the same name. The earliest valid profile wins. A later payment under that name stays on the overlay as a receipt and is not ranked as a new listing. A different owner can use the same display name.

## First success

1. Open `/boost/` with no wallet. Read the business case. The directory is empty until someone has paid. The profile fee and both boost packs are already on the quote.
2. Click **Buy profile**. Approve Desktop. The profile fee is its own output. The profile receipt lands on the overlay.
3. Share `?p=<profileId>&tx=<txid>`.
4. A stranger opens that link and clicks **Export reading**. No wallet.
5. The owner **Buy 12-hour boost** or **Buy 24-hour boost**. Approve Desktop. The boost receipt lands on the overlay.
6. The directory shows that listing above unboosted ones while the window is open. After the end time, refresh and it falls back. Anyone can read the boost receipts.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `createSignature` via the visitor’s Desktop (`WalletClient('auto', originator())`, originator = page hostname).
- Identity: 66-hex compressed pubkey. The buyer’s boost key is the owner. An optional desk key sits under Advanced and receives the fees. Hex stays readable, not as the pitch.
- State: wallet basket `boost`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `boost`).
- Encoding: PushDrop fields — profile, boost.
- Payment: profile fee on buy, boost pack on boost. Satoshis only. No other chain.
- Signatures: profiles and boosts are BRC-100 `createSignature` over canonical bytes (`protocolID [0, "boost"]`, `keyID` `boost`, `counterparty` `self`). Read-side checks use the same SHA-256-then-ECDSA verify as the treasury desk.
- Frontend: Vite + React. Overlay via `@bsv/sdk` `TopicBroadcaster` and a raw `/lookup` POST.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `boost`) delivers profile and boost notices. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The quote loads with no wallet prompt.
2. Name the listing, pick a category, write a short blurb. Optional link. Read the profile fee.
3. Click **Buy profile**. Approve Desktop.
4. Share `?p=<profileId>&tx=<txid>`.
5. Stranger: read the listing and **Export reading**. No wallet.
6. Owner: **Buy 12-hour boost** or **Buy 24-hour boost**. Refresh the directory and see the rank. After the window, refresh again.

```bash
cd boost/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5187.

### Tests

```bash
cd boost/frontend
npm test
npm run typecheck
npm run build
```

Protocol encode/decode, fee math, boost-window ranking, expired boost demotion, duplicate profile collision, overlay topic `tm_anytx` even on localhost, MAGIC filter, wallet-missing is not overlay/network/decline, first-paint business case, stranger export.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `boost` |
| Protocol ID | `[0, "boost"]` |
| MAGIC | `boost` |
| Key ID | `boost` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to boost MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `boost`) |
| Categories | `business`, `event`, `vendor` |
| Profile fee | 2,000 sats, labeled, paid once |
| Boost packs | `12h` = 1,000 sats, `24h` = 1,800 sats |
| Signatures | boost key (`keyID` `boost`). Profiles and boosts. |
| Profile id | first 32 hex chars of sha256 of the profile body. A different body cannot reuse it. |
| Collision | same owner and the same normalized name. The earliest profile is the listing. |
| Ranking | an open boost window ranks above listings with none. At `endsAt` it falls back. |
| Profile link | `?p=<profileId>` |

The analog for the business case is DEX Screener’s paid profiles and boosts (about $5.39M of listing fees over 30 days; Enhanced Token Info $299 one-time, list $499; boost packs of 12–24 hours; banners from $299; trending-bar from $2,000). It is not the whole Screener business. The desk prices above are the v0 satoshi fees, not those dollar prices.

## Layout

```
boost/
  protocol/          field encode/decode, fees, ranking, collision
  frontend/          GitHub Pages static app
```
