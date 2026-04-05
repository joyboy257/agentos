/**
 * Web search and fetch tools.
 * Search uses Brave Search API (https://api.search.brave.com/api/documentation/web-search)
 * Fetch uses native fetch with HTML parsing.
 */

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export async function webSearchTool(query: string, limit: number = 10): Promise<{ results: SearchResult[] }> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    // Graceful fallback to stub when not configured
    return {
      results: [
        {
          title: `[Configure BRAVE_API_KEY] Result for ${query}`,
          url: `https://example.com?q=${encodeURIComponent(query)}`,
          snippet: `BRAVE_API_KEY not set — configure it to enable real web search. Query: ${query}`,
        },
      ],
    }
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(limit, 20)),
  })

  const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brave Search API error ${res.status}: ${text}`)
  }

  const data = await res.json() as any

  const web = data?.web?.results?.results ?? []
  const results: SearchResult[] = web.slice(0, limit).map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.description ?? '',
  }))

  return { results }
}

export async function webFetchTool(url: string): Promise<{ title: string; content: string; snippet: string } | { error: boolean; message: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'AgentOS/1.0 (compatible; fetch)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok) {
      return { error: true, message: `HTTP ${res.status} for ${url}` }
    }

    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : url

    // Strip scripts, styles, comments
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const snippet = cleaned.slice(0, 200)
    const content = cleaned.slice(0, 5000)

    return { title, content, snippet }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: true, message: `Failed to fetch ${url}: ${msg}` }
  }
}
