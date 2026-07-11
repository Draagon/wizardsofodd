import { describe, it, expect } from "vitest";
import { search } from "../src/llm/web-search";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("search", () => {
  it("returns the top 5 results mapped to {title,url,content}", async () => {
    let capturedUrl = "";
    const fakeFetch = async (url: string) => {
      capturedUrl = url;
      return jsonResponse({
        results: Array.from({ length: 8 }, (_, i) => ({
          title: `r${i}`, url: `https://x/${i}`, content: `snippet ${i}`,
        })),
      });
    };
    const out = await search({ query: "what is XYZ?", searchUrl: "https://test", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ title: "r0", url: "https://x/0", content: "snippet 0" });
    expect(capturedUrl).toContain("https://test/search");
    expect(capturedUrl).toContain("q=what+is+XYZ%3F");
    expect(capturedUrl).toContain("format=json");
    expect(capturedUrl).toContain("safesearch=1");
  });

  it("returns an empty array on empty results", async () => {
    const fakeFetch = async () => jsonResponse({ results: [] });
    const out = await search({ query: "q", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(out).toEqual([]);
  });

  it("returns an empty array on a non-200 response (does not throw)", async () => {
    const fakeFetch = async () => new Response("nope", { status: 503 });
    const out = await search({ query: "q", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(out).toEqual([]);
  });

  it("returns an empty array when fetch itself throws (e.g., network down)", async () => {
    const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
    const out = await search({ query: "q", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(out).toEqual([]);
  });

  it("aborts and returns empty array on timeout", async () => {
    const fakeFetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const out = await search({
      query: "q", timeoutMs: 30,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(out).toEqual([]);
  });

  it("tolerates missing fields in results without crashing", async () => {
    const fakeFetch = async () => jsonResponse({ results: [{ title: "only-title" }, { url: "https://only-url" }] });
    const out = await search({ query: "q", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(out).toEqual([
      { title: "only-title", url: "", content: "" },
      { title: "", url: "https://only-url", content: "" },
    ]);
  });

  it("sends CF-Access service-token headers when both id and secret are provided", async () => {
    let capturedHeaders: Headers | undefined;
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      // RequestInit.headers may be a plain object — normalize via Headers for inspection.
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return jsonResponse({ results: [{ title: "r", url: "https://x", content: "c" }] });
    };
    await search({
      query: "q",
      cfAccessClientId: "id-123",
      cfAccessClientSecret: "secret-xyz",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(capturedHeaders?.get("cf-access-client-id")).toBe("id-123");
    expect(capturedHeaders?.get("cf-access-client-secret")).toBe("secret-xyz");
  });

  it("does NOT send CF-Access headers when credentials are absent", async () => {
    let capturedHeaders: Headers | undefined;
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return jsonResponse({ results: [] });
    };
    await search({ query: "q", fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(capturedHeaders?.get("cf-access-client-id")).toBeNull();
    expect(capturedHeaders?.get("cf-access-client-secret")).toBeNull();
  });

  it("does NOT send CF-Access headers when only one of id/secret is provided (partial creds invalid)", async () => {
    let capturedHeaders: Headers | undefined;
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return jsonResponse({ results: [] });
    };
    await search({
      query: "q",
      cfAccessClientId: "id-only",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(capturedHeaders?.get("cf-access-client-id")).toBeNull();
  });
});
