import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const WIZARDS_DIR = "data/wizards";
const PORTRAITS_DIR = "public/portraits";

function wizardIds(): string[] {
  return readdirSync(WIZARDS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

function portraitIds(): string[] {
  return readdirSync(PORTRAITS_DIR)
    .filter((f) => f.endsWith(".webp") && !f.startsWith("verdict-"))
    .map((f) => f.replace(/\.webp$/, ""));
}

const wizards = new Set(wizardIds());
const portraits = new Set(portraitIds());
const errors: string[] = [];

for (const id of wizards) {
  if (!existsSync(join(PORTRAITS_DIR, `${id}.webp`))) {
    errors.push(`wizard "${id}" has no portrait at public/portraits/${id}.webp`);
  }
}
for (const id of portraits) {
  if (!wizards.has(id)) {
    errors.push(`orphan portrait public/portraits/${id}.webp has no matching data/wizards/${id}.yaml`);
  }
}

if (errors.length > 0) {
  console.error("verify-portraits failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`verify-portraits OK: ${wizards.size} wizards × portraits matched`);
