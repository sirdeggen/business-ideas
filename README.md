# Business ideas

First versions, shipped fast.

Switcher on GitHub Pages: https://sirdeggen.github.io/business-ideas/

Invoices are the first product. The receivable desk is a collections list on this desk’s own registry — not a second company. Tickets sit after invoices.

Tickets and the receivable desk persist on the public overlay (`https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`, then client-side protocol filters). Local Docker custom topics (`tm_tickets` / `tm_receivables`) remain an optional override via the in-UI overlay URL. Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked.

## Invoices

Send a payable. Get a receipt.

- How to run: [invoices/README.md](./invoices/README.md) (`cd invoices && docker compose up --build`)

## Receivable desk (feature of invoices)

Who do we chase today? Aging in English: on time / a bit late / call them / board should know. Not a bank.

The list is this desk’s own registry. Pages register / list / mark paid use public overlay-us-1 / `tm_anytx`. Local Docker `tm_receivables` is optional.

- Pages UI: https://sirdeggen.github.io/business-ideas/receivables/
- Optional local indexer: `cd receivable-desk && docker compose up --build` (overlay :8082, UI :5175)
- How to run: [receivable-desk/README.md](./receivable-desk/README.md)

## Event tickets

Tickets you can send, show on a phone, and spend at the door so they can’t be used twice.

Mint, transfer, redeem, and door lookup persist on public overlay-us-1 / `tm_anytx`. Local Docker `tm_tickets` is optional. How to run: [event-tickets/README.md](./event-tickets/README.md)

## 402 publisher (server / local Docker)

Pay-per-crawl Ghost-class page. HTTP 402 invoice in sats for readers and crawlers. Express server — not a static Pages app.

- Repo: [402-publisher/](./402-publisher/)
- How to run: [402-publisher/README.md](./402-publisher/README.md)
- Cluster path later: `/402-publisher`

## 402 MCP (server / local Docker)

Paid MCP tools in sats. Payment is the credential — no signup, no API key. Express / MCP server — not a static Pages app.

- Repo: [402-mcp/](./402-mcp/)
- How to run: [402-mcp/README.md](./402-mcp/README.md)
- Cluster path later: `/402-mcp`

## Treasury (PR / local Docker)

Shared treasury, two of three must agree. Create, invite signers, fund, propose, approve, export CSV. Not a custodian.

- Open PR: https://github.com/sirdeggen/business-ideas/pull/7 (`treasury/` is not on main yet)
- How to run: `cd treasury && docker compose up --build` — feed :8080, UI :5173 — [treasury/README.md](https://github.com/sirdeggen/business-ideas/blob/cursor/bsv-policy-treasury-5b3a/treasury/README.md)
