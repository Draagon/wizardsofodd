import { HomePage } from "./pages/HomePage";

// Vite replaces import.meta.env.VITE_* at build time. The site key is the
// public Cloudflare Turnstile site key (safe to ship to clients — it pairs
// with a server-side secret the Worker holds). Default to the test-bypass
// key so dev + the current reference-impl prod deploy both work without a
// separate .env.production.
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

export function App() {
  return <HomePage turnstileSiteKey={siteKey} />;
}
