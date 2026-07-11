import type { SyntheticEvent } from "react";

/** Portrait path derived by convention from a wizard id: /portraits/<id>.webp. */
export function portraitSrc(wizardId: string): string {
  return `/portraits/${wizardId}.webp`;
}

/**
 * Hide a broken portrait instead of showing the browser's 404 icon. Used wherever
 * a portrait is derived from a wizard id that might not resolve at runtime:
 *  - a dissent's wizardId, which the Clerk (an LLM) generates and may not match a
 *    real wizard id exactly, and
 *  - a historical share page rendered after a wizard was removed.
 * The wizard's name carries through regardless, so the row stays legible.
 */
export function onPortraitError(e: SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = "none";
}
