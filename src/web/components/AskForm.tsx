import { useEffect, useRef, useState } from "react";
import { loadTurnstileScript } from "../lib/turnstile";

interface Props {
  /** Cloudflare Turnstile site key — comes from a Worker env var threaded through index.html. */
  siteKey: string;
  /** Called with question + verified Turnstile token. */
  onSubmit: (question: string, turnstileToken: string) => void;
  /** When true (live council in flight), submit button is disabled. */
  busy: boolean;
  /** When true, submit is disabled regardless of question/token (e.g. no wizards selected). */
  blocked?: boolean;
  /** Shown when blocked, to explain why submit is disabled. */
  blockedMessage?: string;
}

export function AskForm({ siteKey, onSubmit, busy, blocked = false, blockedMessage }: Props) {
  const [question, setQuestion] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    loadTurnstileScript()
      .then(() => {
        if (!mounted || !turnstileRef.current || !window.turnstile) return;
        const id = window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: (t) => setToken(t),
          "error-callback": () => setToken(null),
        });
        setWidgetId(id);
      })
      .catch(() => {
        // Network failed; user sees no widget, submit button stays disabled.
      });
    return () => {
      mounted = false;
    };
  }, [siteKey]);

  const canSubmit = question.trim().length > 0 && token !== null && !busy && !blocked;

  return (
    <form
      className="ask-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(question.trim(), token!);
        // Reset Turnstile so a second question requires a fresh challenge
        if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
        setToken(null);
      }}
    >
      <label>
        Pose a question to the Guild:
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Should I quit my job to start a wizarding consultancy?"
          rows={3}
          disabled={busy}
          required
        />
      </label>
      <div ref={turnstileRef} className="turnstile" />
      {blocked && blockedMessage ? <p className="form-hint">{blockedMessage}</p> : null}
      <button type="submit" disabled={!canSubmit}>
        {busy ? "The Guild deliberates…" : "Ask the Guild"}
      </button>
    </form>
  );
}
