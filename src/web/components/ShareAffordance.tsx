import { useState } from "react";

export function ShareAffordance({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/c/${slug}`;
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable — fall back to manual selection.
      prompt("Copy this URL:", url);
    }
  };
  return (
    <div className="share-affordance">
      <button onClick={handle}>{copied ? "Copied!" : "Copy share link"}</button>
      <a href={url}>{url}</a>
    </div>
  );
}
