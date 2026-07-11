#!/usr/bin/env tsx
/**
 * One-off generator for the Wizards of Odd visual assets.
 * Reads prompts from scripts/prompts/, posts SDXL workflows to a local ComfyUI
 * instance, downloads the result, and writes WebP to public/.
 *
 *   npm run gen:assets                    # all 7
 *   npm run gen:assets -- --background    # background only
 *   npm run gen:assets -- --wizard grumbel        # one portrait
 *   npm run gen:assets -- --wizard verdict-seal   # the seal
 *
 * Requires ComfyUI running at http://127.0.0.1:8188 with Juggernaut-XL-v9
 * present in models/checkpoints/. Start it from your ComfyUI checkout:
 *   ./venv/bin/python main.py --listen 127.0.0.1 --port 8188
 */
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const COMFY_URL = process.env.COMFY_URL ?? "http://127.0.0.1:8188";
const CHECKPOINT = process.env.COMFY_CHECKPOINT ?? "Juggernaut-XL-v9.safetensors";
const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PROMPTS_DIR = path.join(REPO_ROOT, "scripts/prompts");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

interface AssetDef {
  /** prompt filename (without .txt) */
  slug: string;
  /** where to write the resulting webp */
  outPath: string;
  /** generation dimensions — must be SDXL-friendly (multiples of 64) */
  width: number;
  height: number;
  /** final dimensions after sharp resize (omit = same as gen size) */
  finalWidth?: number;
  finalHeight?: number;
  /** webp quality (1-100) */
  quality: number;
}

// Wizard portrait slugs are derived from data/wizards/*.yaml (the roster source
// of truth, same as verify-portraits) so this never goes stale as wizards are
// added; "verdict-seal" is the one non-wizard portrait asset.
const WIZARD_SLUGS = readdirSync(path.join(REPO_ROOT, "data/wizards"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.replace(/\.yaml$/, ""))
  .sort();
const PORTRAIT_SLUGS = [...WIZARD_SLUGS, "verdict-seal"];

const ASSETS: AssetDef[] = [
  {
    // SDXL native-friendly 1216x832 (≈3:2 ≈16:9), then resized to canonical 1920x1080.
    slug: "background",
    outPath: path.join(PUBLIC_DIR, "background.webp"),
    width: 1216, height: 832, finalWidth: 1920, finalHeight: 1080, quality: 78,
  },
  ...PORTRAIT_SLUGS.map((slug): AssetDef => ({
    // SDXL native 1024x1024, displayed at 80px so we downscale to 512 for retina + crisp.
    slug,
    outPath: path.join(PUBLIC_DIR, `portraits/${slug}.webp`),
    width: 1024, height: 1024, finalWidth: 512, finalHeight: 512, quality: 82,
  })),
];

async function loadPrompt(slug: string): Promise<{ prompt: string; negative: string }> {
  const text = await fs.readFile(path.join(PROMPTS_DIR, `${slug}.txt`), "utf8");
  const [prompt, negative] = text.split(/^###$/m).map((s) => s.trim());
  if (!prompt) throw new Error(`Empty prompt for ${slug}`);
  return { prompt, negative: negative ?? "" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build a minimal SDXL txt2img workflow in ComfyUI's prompt-API JSON format. */
function buildWorkflow(prompt: string, negative: string, width: number, height: number, seed: number) {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed, steps: 30, cfg: 7,
        sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CHECKPOINT } },
    "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "wizardsofodd" } },
  };
}

interface ImageRef { filename: string; subfolder: string; type: string }
interface HistoryEntry {
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
  outputs?: Record<string, { images?: ImageRef[] }>;
}

async function submitJob(workflow: unknown, clientId: string): Promise<string> {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`ComfyUI submit failed ${res.status}: ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!data.prompt_id) {
    throw new Error(`ComfyUI rejected workflow: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data.prompt_id;
}

async function awaitResult(promptId: string): Promise<ImageRef> {
  const deadline = Date.now() + 5 * 60_000; // 5 min cap; SDXL on RTX 4070 is ~10-15s
  while (Date.now() < deadline) {
    await sleep(1500);
    const res = await fetch(`${COMFY_URL}/history/${promptId}`);
    if (!res.ok) continue;
    const data = (await res.json()) as Record<string, HistoryEntry>;
    const entry = data[promptId];
    if (!entry) continue;
    if (entry.status?.status_str === "error") {
      throw new Error(`ComfyUI workflow error: ${JSON.stringify(entry.status).slice(0, 400)}`);
    }
    if (entry.status?.completed) {
      for (const out of Object.values(entry.outputs ?? {})) {
        const img = out.images?.[0];
        if (img) return img;
      }
      throw new Error(`Completed but no image in outputs: ${JSON.stringify(entry).slice(0, 400)}`);
    }
  }
  throw new Error(`Timed out waiting for ${promptId}`);
}

async function downloadImage(ref: ImageRef): Promise<Buffer> {
  const url = new URL(`${COMFY_URL}/view`);
  url.searchParams.set("filename", ref.filename);
  url.searchParams.set("subfolder", ref.subfolder || "");
  url.searchParams.set("type", ref.type);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${ref.filename}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generate(asset: AssetDef, clientId: string): Promise<void> {
  const { prompt, negative } = await loadPrompt(asset.slug);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  console.log(`[${asset.slug}] submitting (${asset.width}x${asset.height}, seed ${seed})...`);
  const workflow = buildWorkflow(prompt, negative, asset.width, asset.height, seed);
  const promptId = await submitJob(workflow, clientId);
  console.log(`[${asset.slug}] prompt ${promptId}, polling...`);
  const ref = await awaitResult(promptId);
  console.log(`[${asset.slug}] downloading ${ref.filename}...`);
  const png = await downloadImage(ref);

  let pipeline = sharp(png);
  if (asset.finalWidth && asset.finalHeight) {
    pipeline = pipeline.resize(asset.finalWidth, asset.finalHeight, { fit: "cover" });
  }
  await fs.mkdir(path.dirname(asset.outPath), { recursive: true });
  await pipeline.webp({ quality: asset.quality }).toFile(asset.outPath);
  const stat = await fs.stat(asset.outPath);
  console.log(`[${asset.slug}] wrote ${path.relative(REPO_ROOT, asset.outPath)} (${Math.round(stat.size / 1024)} KB)`);
}

function parseArgs(argv: string[]): AssetDef[] {
  const args = argv.slice(2);
  if (args.length === 0) return ASSETS;
  const out: AssetDef[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--background") {
      const m = ASSETS.find((x) => x.slug === "background");
      if (m) out.push(m);
    } else if (a === "--wizard") {
      const slug = args[i + 1]; i += 1;
      const m = ASSETS.find((x) => x.slug === slug);
      if (!m) throw new Error(`Unknown --wizard ${slug}. Known: ${PORTRAIT_SLUGS.join(", ")}`);
      out.push(m);
    } else {
      throw new Error(`Unknown arg ${a}`);
    }
  }
  return out;
}

async function pingComfy(): Promise<void> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`);
    if (!res.ok) throw new Error(String(res.status));
  } catch (err) {
    throw new Error(`ComfyUI not reachable at ${COMFY_URL} — start it from your ComfyUI checkout (${err instanceof Error ? err.message : err})`);
  }
}

async function main() {
  const targets = parseArgs(process.argv);
  await pingComfy();
  const clientId = randomUUID();
  for (const asset of targets) {
    await generate(asset, clientId);
  }
  console.log(`done (${targets.length} asset${targets.length === 1 ? "" : "s"}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
