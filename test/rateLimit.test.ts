import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { checkAndCount, checkAndCountIp, type LimitConfig } from "../src/middleware/rateLimit";

const cfg: LimitConfig = { perVisitorPerDay: 2, globalPerDay: 100, killSwitch: "off" };

describe("checkAndCount", () => {
  it("allows up to the per-visitor limit then blocks", async () => {
    const visitor = `v-${crypto.randomUUID()}`;
    const a = await checkAndCount(env.RATE_LIMIT, visitor, cfg);
    const b = await checkAndCount(env.RATE_LIMIT, visitor, cfg);
    const c = await checkAndCount(env.RATE_LIMIT, visitor, cfg);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.reason).toBe("visitor");
  });

  it("blocks everyone when the kill switch is on", async () => {
    const res = await checkAndCount(env.RATE_LIMIT, `v-${crypto.randomUUID()}`, { ...cfg, killSwitch: "on" });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("killswitch");
  });
});

describe("checkAndCountIp", () => {
  it("allows up to the per-IP daily limit then blocks", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 255)}`;
    const a = await checkAndCountIp(env.RATE_LIMIT, ip, 2);
    const b = await checkAndCountIp(env.RATE_LIMIT, ip, 2);
    const c = await checkAndCountIp(env.RATE_LIMIT, ip, 2);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(false);
  });

  it("counts distinct IPs in separate buckets", async () => {
    const ip1 = `198.51.100.${Math.floor(Math.random() * 255)}`;
    const ip2 = `192.0.2.${Math.floor(Math.random() * 255)}`;
    // Exhaust ip1's budget.
    await checkAndCountIp(env.RATE_LIMIT, ip1, 1);
    const ip1Blocked = await checkAndCountIp(env.RATE_LIMIT, ip1, 1);
    // ip2 still has full budget.
    const ip2Ok = await checkAndCountIp(env.RATE_LIMIT, ip2, 1);
    expect(ip1Blocked).toBe(false);
    expect(ip2Ok).toBe(true);
  });

  it("does not store the raw IP — only a 16-hex-char SHA-256 prefix", async () => {
    const ip = "203.0.113.42";
    await checkAndCountIp(env.RATE_LIMIT, ip, 5);
    // Walk KV keys for today and assert the raw IP appears nowhere.
    const day = new Date().toISOString().slice(0, 10);
    const list = await env.RATE_LIMIT.list({ prefix: `rl:i:${day}:` });
    const keys = list.keys.map((k) => k.name);
    expect(keys.some((k) => k.includes(ip))).toBe(false);
    // Exactly one key matches our shape: rl:i:YYYY-MM-DD:<16 hex chars>
    expect(keys.some((k) => /^rl:i:\d{4}-\d{2}-\d{2}:[0-9a-f]{16}$/.test(k))).toBe(true);
  });
});
