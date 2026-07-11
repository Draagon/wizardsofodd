#!/usr/bin/env tsx
/**
 * Generates favicon PNGs from public/portraits/verdict-seal.webp (the Guild's sigil).
 * Run once after the verdict seal is generated; rerun only if the seal changes.
 *
 *   npm run gen:favicons
 *
 * Outputs:
 *   public/favicon-16.png   – browser tab (low-DPI)
 *   public/favicon-32.png   – browser tab (high-DPI)
 *   public/apple-touch-icon.png  – iOS home-screen (180x180)
 *   public/icon-192.png     – Android / PWA
 *   public/icon-512.png     – PWA / OG
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SOURCE = path.join(REPO_ROOT, "public/portraits/verdict-seal.webp");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

const TARGETS: Array<{ name: string; size: number }> = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

async function main() {
  await fs.access(SOURCE).catch(() => {
    throw new Error(`Source missing: ${SOURCE} — generate it first (npm run gen:assets -- --wizard verdict-seal)`);
  });
  const src = sharp(SOURCE);
  for (const { name, size } of TARGETS) {
    const out = path.join(PUBLIC_DIR, name);
    await src.clone().resize(size, size, { fit: "cover" }).png({ quality: 90 }).toFile(out);
    const stat = await fs.stat(out);
    console.log(`wrote ${name} (${size}x${size}, ${Math.round(stat.size / 1024)} KB)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
