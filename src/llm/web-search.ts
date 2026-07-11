export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchParams {
  query: string;
  /** SearXNG instance URL. In production this comes from the SEARCH_URL Worker
   *  secret (a self-hosted SearXNG behind Cloudflare Access); the default below
   *  is a placeholder for local dev — set SEARCH_URL to your own instance. */
  searchUrl?: string;
  /** abort the request after this many ms; defaults to 3000 */
  timeoutMs?: number;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  /**
   * Optional Cloudflare Access service-token credentials. When BOTH are present,
   * sent as CF-Access-Client-Id / CF-Access-Client-Secret headers so the request
   * passes through any CF Access wall protecting the search endpoint.
   */
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

// Placeholder for local dev only — production sets the SEARCH_URL secret. An
// unreachable default degrades gracefully: search() never throws, so a missing/
// wrong SEARCH_URL just yields no sources (the council proceeds without RAG).
const DEFAULT_SEARCH_URL = "https://searxng.example.com";
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_RESULTS = 5;

/**
 * Posts a search query to a SearXNG instance and returns the top results.
 * Designed to NEVER throw — failures (network, non-200, timeout, malformed JSON)
 * are swallowed and produce an empty array. Callers can treat an empty array
 * as "search unavailable" and degrade gracefully.
 */
export async function search(params: SearchParams): Promise<SearchResult[]> {
  const doFetch = params.fetchImpl ?? fetch;
  const base = params.searchUrl ?? DEFAULT_SEARCH_URL;
  const url = new URL("/search", base);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "1");

  const headers: Record<string, string> = {};
  if (params.cfAccessClientId && params.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = params.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = params.cfAccessClientSecret;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await doFetch(url.toString(), { signal: controller.signal, headers });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as { results?: Array<Partial<SearchResult>> };
    return (data.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
