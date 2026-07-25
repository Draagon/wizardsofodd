// URL-safe opaque short-slug generator.
//
// SINGLE SOURCE OF TRUTH: the slug SHAPE (alphabet + length) is declared once, as
// the validator.regex on the `shortSlug` abstract in
// metaobjects/abstracts/meta-short-slug-field.yaml. `Council.id extends: shortSlug`
// codegen's that regex into Council.id's validator; we DERIVE the generation alphabet
// and length straight out of that same codegen'd pattern here, so generation can never
// drift from validation. (Web Crypto is a runtime call, so only the random draw stays
// hand-coded — the alphabet itself is no longer restated.)
//
// share.ts derives its route-param VALIDATOR from the same Council.id field; this is
// the generation-side half of that single-sourcing.
import { Council } from "./generated/Council";

// The codegen'd slug pattern is /^[<alphabet>]{<length>}$/ — an explicit character
// class (no ranges), so each character is an equiprobable draw. Pull both out of it.
const { source: SLUG_PATTERN_SOURCE } = Council.id.rules.pattern.value;
const shape = SLUG_PATTERN_SOURCE.match(/\[([^\]]+)\]\{(\d+)\}/);
if (!shape) {
  throw new Error(`slug: could not derive alphabet/length from Council.id pattern "${SLUG_PATTERN_SOURCE}"`);
}
const ALPHABET = shape[1];
const SLUG_LENGTH = Number(shape[2]);

export function newSlug(length = SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
