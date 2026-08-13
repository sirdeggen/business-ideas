# Business ideas

First versions, shipped fast.

Switcher on GitHub Pages: https://sirdeggen.github.io/business-ideas/

Invoices are the first product. The receivable desk is a collections list on this desk’s own registry — not a second company. Tickets sit after invoices.

## Invoices

Send a payable. Get a receipt.

- How to run: [invoices/README.md](./invoices/README.md) (`cd invoices && docker compose up --build`)

## Receivable desk (feature of invoices)

Who do we chase today? Aging in English: on time / a bit late / call them / board should know. Not a bank. This Pages UI does not settle.

The list is this desk’s own registry (sample invoices in `receivable-desk/`). Overlay is localhost.

- Pages UI (no settle): https://sirdeggen.github.io/business-ideas/receivables/
- Overlay and settle: `cd receivable-desk && docker compose up --build` (overlay :8082, UI :5175)
- How to run: [receivable-desk/README.md](./receivable-desk/README.md)

## Event tickets (Pages demo)

Tickets you can send, show on a phone, and spend at the door so they can’t be used twice.

- Demo: https://sirdeggen.github.io/business-ideas/tickets/
- How to run overlay + frontend: [event-tickets/README.md](./event-tickets/README.md)

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
