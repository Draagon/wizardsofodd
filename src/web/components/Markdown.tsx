import { renderMarkdownLite } from "../../render/markdown-lite";

// Render markdown via the shared escape-then-render helper. The helper is
// XSS-safe (it escapes HTML before applying italic/bold/heading transforms),
// so dangerouslySetInnerHTML is OK here — the underlying string is HTML-safe
// by construction.
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdownLite(source) }} />;
}
