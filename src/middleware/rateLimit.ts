export interface LimitConfig {
  perVisitorPerDay: number;
  globalPerDay: number;
  killSwitch: string; // "on" disables everything
}

export interface LimitResult {
  allowed: boolean;
  reason?: "killswitch" | "visitor" | "global";
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

const DAY_TTL = 60 * 60 * 24;

async function bump(kv: KVNamespace, key: string, limit: number): Promise<boolean> {
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: DAY_TTL });
  return true;
}

/**
 * Increments the visitor and global counters for today.
 * Returns allowed=false (without counting against the visitor) when blocked.
 * Note: KV read-modify-write is non-atomic, so under concurrency the caps are
 * best-effort (a few requests may slip past) — fine for cost control, not a hard gate.
 */
export async function checkAndCount(kv: KVNamespace, visitorId: string, cfg: LimitConfig): Promise<LimitResult> {
  if (cfg.killSwitch === "on") return { allowed: false, reason: "killswitch" };

  const day = today();
  const visitorKey = `rl:v:${day}:${visitorId}`;
  const globalKey = `rl:g:${day}`;

  const globalCount = parseInt((await kv.get(globalKey)) ?? "0", 10);
  if (globalCount >= cfg.globalPerDay) return { allowed: false, reason: "global" };

  const visitorOk = await bump(kv, visitorKey, cfg.perVisitorPerDay);
  if (!visitorOk) return { allowed: false, reason: "visitor" };

  await bump(kv, globalKey, cfg.globalPerDay);
  return { allowed: true };
}

/**
 * Hash an IP address with SHA-256 and return the first 16 hex chars.
 * 16 hex chars = 64 bits of entropy — plenty to avoid collisions across the
 * ~few-thousand-distinct-IPs/day scale we'd ever see. Storing only the
 * hash (not the raw IP) keeps the rate-limit layer compatible with
 * ADR-0007's anonymous-first stance.
 */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Per-IP daily rate limit. Returns false when the IP has exhausted its budget
 * for the UTC day. KV-backed, 24h TTL, hashed key (raw IP never stored).
 *
 * Composition with checkAndCount: callers run both checks. They live as
 * separate functions because their config shapes are different (per-IP only
 * needs a single number; per-visitor lives inside a richer LimitConfig).
 */
export async function checkAndCountIp(kv: KVNamespace, ip: string, perDay: number): Promise<boolean> {
  const key = `rl:i:${today()}:${await hashIp(ip)}`;
  return bump(kv, key, perDay);
}
