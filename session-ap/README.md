# Session AP (v0)

Close a session. One invoice for many small spends.

A bookkeeper rolls small sat spends (or pasted 402-receipt ids) into one session invoice. A treasurer reads the book, approves, pays once, and exports the lines. Not a 402 server. Not invoices — that product is a one-shot payable (one memo, one amount, one pay).

Pages talks to the public overlay at `https://overlay-us-1.bsvb.tech` (`tm_anytx` / `ls_anytx`) and filters client-side by this app’s MAGIC. Approve and pay also send a private nudge on Message Box at `https://gmb.bsvblockchain.tech`. Overlay is the public book — a stranger can open a session invoice with no wallet. Message Box list often misses same-wallet send-to-self; reload still shows approved or paid from overlay.

Public UI: `https://sirdeggen.github.io/business-ideas/session/`

Wallet is only asked to record a spend stub, close the books, Approve, or Pay. Use the shared funded Desktop. Do not create a new wallet.

## How to try

1. Open the desk. No wallet prompt on first paint.
2. Open a session: human label, payer account, due date.
3. Attach lines two ways: paste a receipt or transaction id, or record a small spend (typed dollars → sats on Send).
4. Close the books. Copy the treasurer link (`?session=`).
5. Treasurer (or anyone with the link) reads payer, lines + receipt hashes, due date, and the rolled-up total with no wallet.
6. Approve, then Pay once for the total. Export JSON or CSV.

## How to run locally

```bash
cd session-ap/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5178. Overlay default is `https://overlay-us-1.bsvb.tech`.

```bash
cd session-ap/frontend
npm test
```

Unit tests cover receipt hashing, the status machine, approval/payment join, MAGIC filtering, and dollar → sat conversion. They do not need a live overlay.
