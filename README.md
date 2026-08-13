# BSV business ideas

First versions of BSV product ideas, shipped fast.

Switcher on GitHub Pages: https://sirdeggen.github.io/business-ideas/

Three v0s share this repo. The Pages site is a static catalog: tickets is live there; the 402 apps are servers (run locally / Docker, later on a cluster).

## Event tickets (live)

Tickets as BSV UTXOs: mint into a BRC-100 basket, hold/show a QR, transfer by spend, redeem at the door.

- Demo: https://sirdeggen.github.io/business-ideas/tickets/
- How to run overlay + frontend: [event-tickets/README.md](./event-tickets/README.md)

## 402 publisher (coming / run via Docker)

Pay-per-crawl Ghost-class page. HTTP 402 invoice in sats for readers and crawlers. Express server — not a static Pages app.

- Repo: [402-publisher/](./402-publisher/)
- How to run: [402-publisher/README.md](./402-publisher/README.md)
- Live cluster path will be `/402-publisher`

## 402 MCP (coming / run via Docker)

Paid MCP tools in sats. Payment is the credential — no signup, no API key. Express / MCP server — not a static Pages app.

- Repo: [402-mcp/](./402-mcp/)
- How to run: [402-mcp/README.md](./402-mcp/README.md)
- Live cluster path will be `/402-mcp`
