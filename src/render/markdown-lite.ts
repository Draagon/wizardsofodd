// Shared lightweight markdown renderer used by both the homepage React
// bundle (via the Markdown component) and any Worker-side SSR path. The
// source is LLM-generated, so the contract is **escape FIRST**, then
// introduce only our own <strong>/<em>/<br> tags — no path for HTML
// injection. Lifted verbatim from the original `public/app.js` helper
// so byte-equivalent output is preserved across the migration.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Escape-then-render *italic* / **bold** / ## headings / blank-line paragraphs
 * to an HTML-safe string. Suitable for `dangerouslySetInnerHTML` because
 * any raw HTML in `raw` has already been escaped before the transforms run.
 */
export function renderMarkdownLite(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/^\s*#{1,6}\s+(.+?)\s*$/gm, "<strong>$1</strong>"); // ## heading -> bold
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>"); // **bold**
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, "$1<em>$2</em>"); // *italic*
  s = s.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>"); // paragraphs / line breaks
  return s;
}
