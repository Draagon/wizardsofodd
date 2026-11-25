#!/usr/bin/env bash
# Run a Cloudflare command against the wizardsofodd Worker with the site's narrow
# deploy-only token (Infisical deploy/dev CLOUDFLARE_WORKERS_TOKEN_WIZARDSOFODD:
# Account Workers Scripts Write, D1 Write, Workers KV Storage Write, Account Settings
# Read; zone wizardsofodd.com Workers Routes Write, Zone Read). Used by
# `npm run deploy`, `npm run db:migrate:remote` and `npm run verify:db:remote`.
#
# Usage: scripts/cf-deploy.sh <command> [args...]   e.g. scripts/cf-deploy.sh wrangler deploy
# The command runs with the repo's own lockfile-pinned wrangler (node_modules/.bin)
# first on PATH, so `wrangler` and `meta verify --remote` (which shells out to
# `wrangler`) both use it. Override the keys-axi binary with KEYS_AXI.
# Nothing here prints a token value.
set -euo pipefail

[ "$#" -gt 0 ] || { echo "usage: cf-deploy.sh <command> [args...]" >&2; exit 2; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -x "$repo_root/node_modules/.bin/wrangler" ] || {
  echo "cf-deploy.sh: $repo_root/node_modules/.bin/wrangler missing; run npm install" >&2
  exit 1
}
keys_axi="${KEYS_AXI:-$(command -v keys-axi || echo "$HOME/.local/bin/keys-axi")}"

# The global-key variables must not reach wrangler: it would prefer them over the token.
# The inner script is single-quoted on purpose: it expands after keys-axi injects the keys.
# shellcheck disable=SC2016
exec env -u CLOUDFLARE_EMAIL -u CLOUDFLARE_API_KEY -u CLOUDFLARE_API_TOKEN \
  "$keys_axi" run --project deploy --env dev \
  --only CLOUDFLARE_WORKERS_TOKEN_WIZARDSOFODD CLOUDFLARE_ACCOUNT_ID -- \
  bash -c '
    set -euo pipefail
    export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_WORKERS_TOKEN_WIZARDSOFODD:?}"
    unset CLOUDFLARE_WORKERS_TOKEN_WIZARDSOFODD
    : "${CLOUDFLARE_ACCOUNT_ID:?}"
    export PATH="$1/node_modules/.bin:$PATH"
    shift
    exec "$@"
  ' cf-deploy "$repo_root" "$@"
