import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { extractArticle, extractArticleFromHtml } from './extract-article.js'
import { assertPublicHttpUrl, isBlockedIp, isBlockedIPv4, isBlockedIPv6 } from './public-url.js'

const FIXTURE = `<!doctype html>
<html lang="en">
  <head><title>Ignored tab title</title></head>
  <body>
    <nav>Home About Ads</nav>
    <article>
      <h1>Main Story</h1>
      <p>Agents pay for readable article text, not chrome and not a hash.</p>
      <p>This second paragraph should survive extraction.</p>
    </article>
    <footer>Copyright ignore me</footer>
  </body>
</html>`

test('blocks loopback and RFC1918 IPv4', () => {
  assert.equal(isBlockedIPv4('127.0.0.1'), true)
  assert.equal(isBlockedIPv4('10.0.0.1'), true)
  assert.equal(isBlockedIPv4('192.168.1.1'), true)
  assert.equal(isBlockedIPv4('172.16.0.1'), true)
  assert.equal(isBlockedIPv4('169.254.169.254'), true)
  assert.equal(isBlockedIPv4('1.1.1.1'), false)
})

test('blocks IPv6 loopback and ULA', () => {
  assert.equal(isBlockedIPv6('::1'), true)
  assert.equal(isBlockedIPv6('fc00::1'), true)
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true)
})

test('rejects non-http URLs and localhost', async () => {
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /http/)
  await assert.rejects(() => assertPublicHttpUrl('http://localhost/'), /Private/)
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/'), /Private/)
})

test('extractArticleFromHtml returns main article text, not nav chrome', () => {
  const result = extractArticleFromHtml(FIXTURE, 'https://example.com/story')
  assert.match(result.text, /readable article text/)
  assert.match(result.text, /second paragraph/)
  assert.doesNotMatch(result.text, /Home About Ads/)
  assert.ok(result.length > 40)
})

test('extractArticle rejects private hosts', async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(FIXTURE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await assert.rejects(() => extractArticle(`http://127.0.0.1:${address.port}/`), /Private/)
})
