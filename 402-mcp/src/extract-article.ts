import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { FETCH_MAX_BYTES, FETCH_MAX_REDIRECTS, FETCH_TIMEOUT_MS } from './config.js'
import { assertPublicHttpUrl } from './public-url.js'

export interface ExtractArticleResult {
  url: string
  finalUrl: string
  title: string | null
  byline: string | null
  siteName: string | null
  excerpt: string | null
  text: string
  length: number
}

const FETCH_HEADERS = {
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'user-agent': '402-mcp/0.1 (article extract; +https://github.com/sirdeggen/business-ideas)'
}

export function extractArticleFromHtml(html: string, pageUrl: string): Omit<ExtractArticleResult, 'url' | 'finalUrl'> {
  const dom = new JSDOM(html, { url: pageUrl })
  const parsed = new Readability(dom.window.document).parse()
  const text = parsed?.textContent?.replace(/\s+\n/g, '\n').trim() ?? ''
  if (!parsed || text.length === 0) {
    throw new Error('Could not extract article text from this page')
  }
  return {
    title: parsed.title || null,
    byline: parsed.byline || null,
    siteName: parsed.siteName || null,
    excerpt: parsed.excerpt || null,
    text,
    length: text.length
  }
}

async function fetchPublicHtml(urlString: string): Promise<{ html: string; finalUrl: string }> {
  let current = await assertPublicHttpUrl(urlString)
  let response: Response | undefined

  for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: FETCH_HEADERS
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      current = await assertPublicHttpUrl(new URL(location, current).toString())
      continue
    }
    break
  }

  if (!response) throw new Error('Fetch failed')
  if (response.status >= 400) {
    throw new Error(`Upstream returned HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > FETCH_MAX_BYTES) {
        await reader.cancel()
        throw new Error(`Response exceeded ${FETCH_MAX_BYTES} bytes`)
      }
      chunks.push(value)
    }
  }

  return {
    html: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8'),
    finalUrl: current.toString()
  }
}

export async function extractArticle(urlString: string): Promise<ExtractArticleResult> {
  const { html, finalUrl } = await fetchPublicHtml(urlString)
  return { url: urlString, finalUrl, ...extractArticleFromHtml(html, finalUrl) }
}
