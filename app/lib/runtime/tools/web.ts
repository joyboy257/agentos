export async function webSearchTool(query: string, limit: number = 10) {
  return {
    results: [
      { title: `Result for ${query}`, url: `https://example.com?q=${encodeURIComponent(query)}`, snippet: `Example snippet for ${query}` }
    ]
  }
}

export async function webFetchTool(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await res.text()
    const titleMatch = html.match(/<title>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1] : url
    const snippet = html.replace(/<[^>]+>/g, ' ').slice(0, 200)

    return { title, content: html.slice(0, 5000), snippet }
  } catch (err) {
    return { error: true, message: `Failed to fetch ${url}` }
  }
}
