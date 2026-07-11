import { describe, it, expect } from "vitest";
import { verifyTurnstile, TEST_BYPASS_SECRET } from "../src/middleware/turnstile";

const SITE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function okFetch(captured: { url?: string; body?: URLSearchParams }): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.body = init.body as URLSearchParams;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("returns true when CF responds with success:true", async () => {
    const captured: { url?: string; body?: URLSearchParams } = {};
    const ok = await verifyTurnstile({
      token: "tok-abc",
      secret: "real-secret",
      remoteIp: "203.0.113.1",
      fetchImpl: okFetch(captured),
    });
    expect(ok).toBe(true);
    expect(captured.url).toBe(SITE_VERIFY);
    expect(captured.body!.get("secret")).toBe("real-secret");
    expect(captured.body!.get("response")).toBe("tok-abc");
    expect(captured.body!.get("remoteip")).toBe("203.0.113.1");
  });

  it("returns false when CF responds with success:false", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 })) as unknown as typeof fetch;
    const ok = await verifyTurnstile({ token: "tok", secret: "s", fetchImpl });
    expect(ok).toBe(false);
  });

  it("returns false on non-200 response", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const ok = await verifyTurnstile({ token: "tok", secret: "s", fetchImpl });
    expect(ok).toBe(false);
  });

  it("returns false when fetch throws (never propagates)", async () => {
    const fetchImpl = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const ok = await verifyTurnstile({ token: "tok", secret: "s", fetchImpl });
    expect(ok).toBe(false);
  });

  it("returns false when token is missing, even with the bypass secret", async () => {
    const ok = await verifyTurnstile({ token: "", secret: TEST_BYPASS_SECRET });
    expect(ok).toBe(false);
  });

  it("short-circuits to true when secret is the bypass marker AND token is present (without calling fetch)", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const ok = await verifyTurnstile({ token: "anything", secret: TEST_BYPASS_SECRET, fetchImpl });
    expect(ok).toBe(true);
    expect(called).toBe(false);
  });
});
