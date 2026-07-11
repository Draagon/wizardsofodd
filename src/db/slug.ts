// Slug generator. The alphabet here MUST stay consistent with the abstract
// declared in metaobjects/abstracts/meta-short-slug-field.yaml — that file
// is the source of truth for slug VALIDATION (codegen'd into Council.id's
// Zod validator + the share.ts route-param guard, which now imports it).
// This file remains hand-coded for GENERATION (Web Crypto is a runtime call,
// not codegen).
//
// Safe alphabet: alphanumerics minus visually-confusable 0/O/I/l/1 (57 chars).
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newSlug(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
