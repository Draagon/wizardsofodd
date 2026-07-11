// Cloudflare Turnstile loader. Idempotent — multiple components can call
// loadTurnstileScript without duplicate <script> tags.

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let loadPromise: Promise<void> | null = null;

export function loadTurnstileScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      // SSR — pretend it loaded; the widget never mounts server-side anyway.
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

// The Turnstile script attaches `window.turnstile` after loading.
// Type the surface narrowly — we only use render + reset.
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}
