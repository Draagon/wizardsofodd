/**
 * Cloudflare Turnstile token verification.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Fails closed: any error, any non-200, any non-success → false. Never throws.
 * Test-bypass: when secret === TEST_BYPASS_TURNSTILE AND a token is present,
 * returns true WITHOUT calling out. Missing tokens are always rejected so
 * "did the client even include the field?" tests still work in bypass mode.
 */

const SITE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TEST_BYPASS_SECRET = "TEST_BYPASS_TURNSTILE";

export interface TurnstileVerifyParams {
  token: string;
  secret: string;
  /** Optional but recommended — CF uses it for fingerprinting. */
  remoteIp?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function verifyTurnstile(p: TurnstileVerifyParams): Promise<boolean> {
  // A missing token is always rejected — even the bypass cannot rescue it.
  // This keeps "client forgot to include the field" tests honest in dev/CI.
  if (!p.token) return false;
  if (p.secret === TEST_BYPASS_SECRET) return true;

  const doFetch = p.fetchImpl ?? fetch;
  const body = new URLSearchParams();
  body.set("secret", p.secret);
  body.set("response", p.token);
  if (p.remoteIp) body.set("remoteip", p.remoteIp);

  try {
    const res = await doFetch(SITE_VERIFY, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
