import { articles, type Article } from './articles.js'
import { crawlerSats, humanSats } from './pricing.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

const styles = `
:root {
  --bg: #f7f3ea;
  --ink: #1c1916;
  --muted: #5c564d;
  --rule: #d8d0c0;
  --card: #fffdf7;
  --accent: #9a3412;
  --accent-soft: #f3e2d4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161412;
    --ink: #f3eee4;
    --muted: #b3aa9c;
    --rule: #3a342c;
    --card: #1f1b18;
    --accent: #e8b298;
    --accent-soft: #2a211c;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.7;
  min-height: 100vh;
}
a { color: inherit; }
.wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 64px; }
header.mast {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 16px;
  margin-bottom: 28px;
}
.brand { text-decoration: none; display: flex; align-items: baseline; gap: 10px; }
.mark {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 2px solid var(--ink);
  padding: 2px 8px;
  font-size: 0.95rem;
}
.word { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; }
.tag { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; color: var(--muted); }
.prices {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 28px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
}
.prices span {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 999px;
}
.lede { font-size: 1.15rem; color: var(--muted); margin-bottom: 28px; }
.card {
  display: block;
  text-decoration: none;
  background: var(--card);
  border: 1px solid var(--rule);
  padding: 20px 22px;
  margin-bottom: 14px;
}
.card h2 { font-size: 1.35rem; letter-spacing: -0.02em; margin-bottom: 8px; }
.card p { color: var(--muted); }
.meta { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; color: var(--muted); margin-top: 10px; }
article h1 { font-size: 2rem; letter-spacing: -0.03em; line-height: 1.25; margin-bottom: 10px; }
article .lead { font-size: 1.2rem; color: var(--muted); margin: 20px 0 18px; }
article p { margin-bottom: 16px; }
article pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  background: var(--card);
  border: 1px solid var(--rule);
  padding: 14px;
  overflow-x: auto;
  margin-bottom: 16px;
}
article code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
}
`

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="wrap">
    <header class="mast">
      <a class="brand" href="/">
        <span class="mark">402</span>
        <span class="word">Press</span>
      </a>
      <p class="tag">One site. Paid pages. Two prices.</p>
    </header>
    ${body}
    <footer>
      Paid per fetch with BRC-121 · no accounts · humans ${humanSats()} sats · crawlers ${crawlerSats()} sats
    </footer>
  </div>
</body>
</html>`
}

export function indexPage(): string {
  const cards = articles
    .map(
      (article) => `
<a class="card" href="/articles/${encodeURIComponent(article.slug)}">
  <h2>${escapeHtml(article.title)}</h2>
  <p>${escapeHtml(article.excerpt)}</p>
  <p class="meta">${escapeHtml(formatDate(article.date))} · 402 until paid</p>
</a>`
    )
    .join('')

  const body = `
<div class="prices">
  <span>Readers ${humanSats()} sats</span>
  <span>Crawlers ${crawlerSats()} sats</span>
</div>
<p class="lede">A Ghost-class page that charges people and bots for the same articles — HTTP 402 on BSV, priced in sats. The index is free. The essays are not.</p>
${cards}`

  return pageShell('402 Press', body)
}

export function articlePage(article: Article): string {
  const body = `
<article>
  <h1>${escapeHtml(article.title)}</h1>
  <p class="meta">${escapeHtml(formatDate(article.date))}</p>
  ${article.content}
</article>`
  return pageShell(article.title, body)
}

export function notFoundPage(): string {
  return pageShell('Not found', `<p>That article is not on this press.</p><p><a href="/">Back to the index.</a></p>`)
}
