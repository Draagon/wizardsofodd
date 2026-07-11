import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SharePage } from "./share-page";
import type { CouncilWithTurns } from "../db/queries";

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s: string): string {
  return s.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c]!);
}

export function renderShareHtml(data: CouncilWithTurns): string {
  const { council } = data;
  const isComplete = council.status === "complete" && council.verdictMarkdown !== null;
  if (!isComplete) {
    return renderFallback(data);
  }
  const inner = renderToString(createElement(SharePage, { data }));
  const titleQuestion = council.question.length > 80 ? council.question.slice(0, 80) + "…" : council.question;
  const description = (council.verdictMarkdown ?? "").replace(/[*#`]/g, "").slice(0, 160);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Wizards of Odd weigh in on: ${esc(titleQuestion)}</title>
    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <meta property="og:title" content="${esc("The Wizards of Odd weigh in on: " + titleQuestion)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="/portraits/verdict-seal.webp" />
    <meta property="og:type" content="article" />
  </head>
  <body>
    <div id="root">${inner}</div>
  </body>
</html>
`;
}

function renderFallback(data: CouncilWithTurns): string {
  const { council } = data;
  const msg = council.status === "error"
    ? "The tower went dark during this council. The takes above are what made it through."
    : "This council is still in session — try again in a moment.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>The Wizards of Odd — council in session</title>
    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="homepage">
      <header class="masthead"><h1>The Wizards of Odd</h1></header>
      <p>${esc(msg)}</p>
      <p><a href="/">Pose a fresh question →</a></p>
    </main>
  </body>
</html>
`;
}
