# Runbook

Operational procedures for wizardsofodd.com. For *what* and *why*, see
[`architecture.md`](./architecture.md) and [`adr/`](./adr/).

## Deploy

```bash
cd <repo-root>
npx tsc --noEmit && npx vitest run            # gate: must be clean + green
npx wrangler deploy                           # ~5s; prints Version ID
```

Production deploys are direct from `main`. Smoke-check:

```bash
curl -s https://wizardsofodd.com/api/health   # {"ok":true}
```

## Live council smoke test

```bash
curl -sN -X POST https://wizardsofodd.com/api/council \
  -H 'content-type: application/json' \
  -d '{"question":"What was the South Sea Bubble?"}' \
  | grep -E '^(event|data):' | head -30
```

Look for: 5 `event: wizard` frames, 1 `event: verdict` with the 4-point
structure ending in `High confidence: ...` / `Open question: ...`, then
`event: done`. Lorekeeper's reply should contain real URLs (Wikipedia /
StackOverflow / etc.) when SearXNG is up; otherwise his prompt lampshades
the unreachable library.

## Local dev

```bash
echo 'ANTHROPIC_API_KEY = "<dev key from <your-secrets-file>>"' > .dev.vars
npm run dev                                   # wrangler dev, default port 8787
```

Open the printed URL. `.dev.vars` is gitignored and only used by `wrangler dev`.

## Regenerate visual assets

1. **Start ComfyUI** (if not already running):
   ```bash
   cd <your ComfyUI checkout>
   nohup ./venv/bin/python main.py --listen 127.0.0.1 --port 8188 --lowvram \
     > /tmp/comfy.log 2>&1 &
   disown
   ```
   Use `--lowvram` to avoid the `BrokenPipeError` cold-start issue.

2. **Wait until ready:**
   ```bash
   until curl -s http://127.0.0.1:8188/system_stats >/dev/null; do sleep 1; done; echo ready
   ```

3. **Iterate on a prompt** (`scripts/prompts/<slug>.txt`) and regenerate:
   ```bash
   npm run gen:assets -- --wizard grumbel            # one wizard
   npm run gen:assets -- --background                # the background
   npm run gen:assets                                # all 7
   ```
   Outputs land at `public/background.webp` and `public/portraits/<slug>.webp`.

4. **Stop ComfyUI when done:**
   ```bash
   pkill -f "main.py --listen"
   ```

5. **If the verdict-seal regenerates**, also redo the favicons:
   ```bash
   npm run gen:favicons                              # writes 16/32/180/192/512.png
   ```

6. **Commit + deploy** — same as the deploy procedure above.

See [ADR-0003](./adr/0003-comfyui-for-dev-image-gen.md) for why local ComfyUI
instead of RunPod/CF AI for one-off content.

## Adding a wizard

Adding (or replacing) a wizard is a pure metadata change — no TypeScript edits:

1. **Wizard identity** — author `data/wizards/<id>.yaml` (id, name, title,
   technique, bickersWith, usesSearch, techniqueBlurb, defaultEnabled, optional order).
2. **Prompt declarations** — add two `template.prompt` nodes (`<id>System`,
   `<id>User`) to `metaobjects/prompts/meta-prompts-wizards.yaml`, following the
   existing pattern (payloadRef + textRef + format).
3. **Personality** — author `data/templates/wizards/<id>-system.mustache`
   (voice, technique guidance) and `<id>-user.mustache` (how the wizard reads the
   question, prior takes, sources).
4. **Portrait** — drop `public/portraits/<id>.webp` (lowercase id).
5. **Regenerate** — `npm run check` reruns codegen, validates, and runs tests;
   the wizard-registry generator fails the build naming any missing declaration.

To remove a wizard, delete its data/template/portrait files and its two prompt
nodes, then `npm run check`. `test/wizards.test.ts` asserts the roster count —
update the expected number to match.

## Rotate keys

All Worker secrets are set via `wrangler secret put <NAME>` (interactive paste —
never on the command line). The host-side copies live in
`<your-secrets-file>` (chmod 600).

| Secret | Source | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic console → Settings → API Keys | LLM calls for council |
| `CF_ACCESS_CLIENT_ID` | CF Zero Trust → Access → Service Auth → Service Tokens → `wizardsofodd-worker` | Search-endpoint auth |
| `CF_ACCESS_CLIENT_SECRET` | Same | (paired with above; shown ONCE on creation) |

Rotation procedure:

```bash
# 1. Create a fresh value in the issuing console (Anthropic / CF dashboard).
# 2. Push to Worker:
cd <repo-root>
npx wrangler secret put ANTHROPIC_API_KEY     # paste new value
# 3. Update the host-side mirror:
$EDITOR <your-secrets-file>
chmod 600 <your-secrets-file>
# 4. Revoke the old value in the issuing console.
# 5. Smoke-test the live council (above) to confirm nothing broke.
```

For the CF Access service token specifically, the dashboard path is:
**Zero Trust → Access → Service Auth → Service Tokens** → find
`wizardsofodd-worker` → *Refresh* (creates a new secret; the policy on the
"Home Portal" Access app keeps pointing at the same token id, no policy change
needed).

## Inspect / manage the CF Access plumbing

The Worker reaches the protected SearXNG via the `wizardsofodd-worker` service
token, which is attached to the "Home Portal" Access app (`id <access-app-id>`,
covers `<your-host>` + `searxng.example.com` via `self_hosted_domains`).

```bash
# Verify the policy is still in place (needs a CF API token with Access:Apps:Edit)
CF=<your-api-token>
ACCT=<account-id>
APP=<access-app-id>
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCT/access/apps/$APP" \
  -H "Authorization: Bearer $CF" \
  | python3 -c "import sys,json;a=json.load(sys.stdin)['result'];print([p['name'] for p in (a.get('policies') or [])])"
# Expect: ["Allow wizardsofodd-worker service token"]
```

## Logs

```bash
npx wrangler tail wizardsofodd                # live tail
```

`console.error` calls from the stream's catastrophic-error branch (`[council] stream error`)
show up here.

## Migrate

D1 migrations are hand-written SQL files in `migrations/`, applied with:

```bash
npm run db:migrate:local                      # apply to local D1
npm run db:migrate:remote                     # apply to production D1 (run at deploy time)
```

Shipped so far: `0001_init.sql`, `0002_structured_outputs.sql` (Phase O structured
columns), `0003_verdict_agree_split.sql` (W3 honest-verdict map columns). Migrations
are forward-only (SQLite `ALTER TABLE ADD COLUMN`).

> **Why hand-written, not `meta migrate`?** MetaObjects supports `dialect: "d1"` +
> `meta migrate` to *generate* migrations from the metadata. This project keeps them
> hand-written on purpose: the schema is small and every change so far is a trivial
> additive `ADD COLUMN`, so hand-authoring is lower-ceremony and gives full control over
> the exact SQL — with the codegen'd Drizzle schema + the drift gate still keeping the
> runtime code honest to the columns. Flip `dialect` to `"d1"` if the schema grows.

**`db:migrate:remote` is NOT automatic** — after a deploy that adds a migration, run it
against production D1 or the Worker will write to columns that don't exist yet (D1
rejects the unknown columns and the new data is silently dropped). New columns are
nullable, so applying the migration before *or* after the deploy is safe.

> **Test schema:** the Workers-pool test D1 replays `migrations/*.sql` directly
> (`test/setup.ts` loads them via a Vite `?raw` glob, inlined at build time since
> the workerd pool has no filesystem). New migrations are picked up automatically —
> no manual schema sync.

## Common gotchas

- **Wrangler is on 3.x and out-of-date**; works fine, but emits a warning on every
  command. Don't blindly run `wrangler@4` upgrade — verify against the
  Vitest pool's pinned compat first.
- **`compatibility_date` is `2024-12-30`** intentionally (matches the Workers
  runtime version the test pool bundles). Don't bump it past whatever the
  installed `@cloudflare/vitest-pool-workers` supports or tests will warn-spam.
- **`wrangler.jsonc`'s `run_worker_first: ["/api/*"]`** is what lets `/api/*`
  paths reach the Worker through the SPA fallback. If `/api/health` ever starts
  returning the homepage HTML, that's the first thing to check.
- **ComfyUI cold start sometimes hits `BrokenPipeError`** on the first
  generation. Always start with `--lowvram`; if it errors anyway, restart it.

## Turnstile setup (one-time, per environment)

1. **Create the Turnstile site** in the Cloudflare dashboard:
   - Zero Trust → Turnstile → Add site
   - Domain: `wizardsofodd.com` (add `www.wizardsofodd.com` and `localhost` too)
   - Widget mode: **Managed** (lets CF pick invisible vs interactive per request)
   - Copy the **site key** (public) and **secret key** (private)

2. **Swap the public site key in `public/index.html`:**
   ```bash
   sed -i 's|1x00000000000000000000AA|<your-real-sitekey>|' public/index.html
   ```
   The placeholder `1x00000000000000000000AA` is CF's "always passes" test
   key — fine for dev, must be replaced for prod. Commit the change.

3. **Set the secret key as a Worker secret (NOT a var):**
   ```bash
   echo -n '<your-real-secret>' | npx wrangler secret put TURNSTILE_SECRET
   ```
   This overrides the `TEST_BYPASS_TURNSTILE` value in `wrangler.jsonc`
   for the deployed Worker. Local `wrangler dev` continues using the
   bypass marker (no real verification calls during dev).

## Anthropic console budget cap (one-time, per API key)

The ultimate safety net — independent of any Worker code path.

1. Anthropic Console → Settings → Billing → Usage limits
2. Pick the `wizards-of-odd` API key
3. Set **Monthly spend limit: $20**
4. When hit, Anthropic returns 429s; our existing error path renders
   "the tower went dark unexpectedly" gracefully.

## Pre-deploy checklist

Before every `wrangler deploy`:

```bash
# 1. Tests green
npx tsc --noEmit && npx vitest run

# 2. Turnstile secret is set as a SECRET (overriding the bypass var)
npx wrangler secret list | grep -q '^TURNSTILE_SECRET' \
  || (echo 'FATAL: TURNSTILE_SECRET not set as secret'; exit 1)

# 3. public/index.html has the real sitekey (not the test placeholder)
grep -q '1x00000000000000000000AA' public/index.html \
  && (echo 'FATAL: public/index.html still has the test Turnstile sitekey'; exit 1)

# 4. Deploy
npx wrangler deploy
```

The grep guards are intentionally hard-fail. If you see "FATAL", fix
before deploying — bypassing them ships the site open to abuse.

## Live verification after deploy

```bash
# Healthcheck
curl -s https://wizardsofodd.com/api/health   # {"ok":true}

# Missing-token → 429
curl -s -X POST https://wizardsofodd.com/api/council \
  -H 'content-type: application/json' \
  -d '{"question":"test"}' \
  | grep -i ghost   # should match "...not a ghost."
```

Then open https://wizardsofodd.com in a browser and confirm:
- Turnstile widget renders
- Solving it (or auto-solving) → form submits → the selected wizards (5 by default) + verdict

## Tech debt — friction driven upstream

Through the rc era this project relied on several codegen workarounds (vendored
tarballs, local Zod schemas, `as unknown as` casts) for bugs in the payload/queries
generators. They all shipped upstream and were removed; the project now tracks the
current published line (`@metaobjectsdev/*@0.15.x`). The short version of that friction
— and the bugs this project surfaced, including the drift-gate blind spot it had and the
`promptRender` FQN fix that landed in 0.15.18 — lives in the friction log in
[how-metaobjects-is-used.md](./how-metaobjects-is-used.md).
