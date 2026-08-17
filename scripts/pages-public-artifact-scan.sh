#!/usr/bin/env bash
set -euo pipefail

site_dir="${1:-}"
if [[ -z "${site_dir}" || ! -d "${site_dir}" ]]; then
  echo "usage: $0 <pages-site-directory>" >&2
  exit 2
fi

fail() {
  echo "PAGES-009 public artifact scan failed: $*" >&2
  exit 1
}

# A Pages artifact is public forever once delivered. Reject server/developer material
# even when the repository itself is public.
forbidden_paths="$(find "${site_dir}" -mindepth 1 \
  \( -name '.git' -o -name '.github' -o -name 'node_modules' -o -name 'backend' -o -name 'api' \
     -o -name 'scripts' -o -name 'tests' -o -name '.env' -o -name '.env.*' \
     -o -name 'vercel.json' -o -name 'wrangler.toml' -o -name 'wrangler.json' -o -name 'wrangler.jsonc' \
     -o -name 'package.json' -o -name 'package-lock.json' -o -name 'pnpm-lock.yaml' -o -name 'yarn.lock' \
     -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \
     -o -name 'id_rsa*' -o -name 'id_ed25519*' -o -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.db' \) \
  -print)"
if [[ -n "${forbidden_paths}" ]]; then
  printf '%s\n' "${forbidden_paths}" >&2
  fail 'server-only, credential-shaped, or developer-only paths are present'
fi

if find "${site_dir}" -type l -print -quit | grep -q .; then
  fail 'symbolic links are not allowed'
fi
if find "${site_dir}" -type f -links +1 -print -quit | grep -q .; then
  fail 'hard-linked files are not allowed'
fi

# PAGES-011 is a final-artifact invariant, not merely a Three.js-source invariant.
# The composite Pages tree contains the Godot root plus /threejs/, so enforce the
# measured decision here immediately before upload. Any later enabled decision must
# deliberately update this scanner; a marker edit alone is not allowed to turn SW on.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
decision_file="${repo_root}/PAGES_SERVICE_WORKER_DECISION.md"
[[ -s "${decision_file}" ]] || fail 'PAGES-011 decision file is missing'
mapfile -t service_worker_decisions < <(grep -E '^SERVICE_WORKER_DECISION=(none|enabled)$' "${decision_file}" || true)
if [[ "${#service_worker_decisions[@]}" -ne 1 ]]; then
  fail 'PAGES-011 decision marker must appear exactly once'
fi
if [[ "${service_worker_decisions[0]}" != 'SERVICE_WORKER_DECISION=none' ]]; then
  fail 'PAGES-011 enabled mode requires a new measured decision and a deliberate artifact-scanner update'
fi

service_worker_paths="$(find "${site_dir}" -type f \
  \( -iname 'sw.js' -o -iname 'sw.mjs' -o -iname 'sw.cjs' \
     -o -iname 'service-worker.js' -o -iname 'service-worker.mjs' -o -iname 'service-worker.cjs' \
     -o -iname 'service_worker.js' -o -iname 'service_worker.mjs' -o -iname 'service_worker.cjs' \
     -o -iname 'serviceworker.js' -o -iname 'serviceworker.mjs' -o -iname 'serviceworker.cjs' \) \
  -print)"
if [[ -n "${service_worker_paths}" ]]; then
  printf '%s\n' "${service_worker_paths}" >&2
  fail 'PAGES-011 forbids Service Worker files anywhere in the composed Pages artifact while decision=none'
fi

service_worker_registration_hits="$(grep -RIlE --binary-files=without-match \
  --exclude='*.wasm' --exclude='*.pck' --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' \
  --exclude='*.webp' --exclude='*.ico' --exclude='*.glb' --exclude='*.stl' --exclude='*.ttf' \
  --exclude='*.otf' --exclude='*.woff' --exclude='*.woff2' --exclude='*.mp3' --exclude='*.ogg' \
  'serviceWorker[[:space:]]*\.[[:space:]]*register[[:space:]]*\(' \
  "${site_dir}" || true)"
if [[ -n "${service_worker_registration_hits}" ]]; then
  printf '%s\n' "${service_worker_registration_hits}" >&2
  fail 'PAGES-011 forbids Service Worker registration anywhere in the composed Pages artifact while decision=none'
fi

# Keep patterns specific enough for a public repository: declarations/documentation
# elsewhere are fine, but concrete secret-shaped values inside the delivered tree are not.
secret_hits="$(grep -RIlE --binary-files=without-match \
  --exclude='*.wasm' --exclude='*.pck' --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' \
  --exclude='*.webp' --exclude='*.ico' --exclude='*.glb' --exclude='*.stl' \
  'BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|TURSO_AUTH_TOKEN[[:space:]]*[:=][[:space:]]*"?[^"[:space:]]{12,}|CLOUDFLARE_API_TOKEN[[:space:]]*[:=][[:space:]]*"?[^"[:space:]]{12,}|DATABASE_URL[[:space:]]*[:=][[:space:]]*"?(postgres|mysql|libsql|sqlite):' \
  "${site_dir}" || true)"
if [[ -n "${secret_hits}" ]]; then
  printf '%s\n' "${secret_hits}" >&2
  fail 'secret-shaped content is present'
fi

config="${site_dir}/threejs/runtime-config.json"
[[ -s "${config}" ]] || fail 'threejs/runtime-config.json is missing'

node - "${config}" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
let config;
try {
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`Invalid public runtime config JSON: ${error.message}`);
  process.exit(1);
}

const allowed = new Set(['frontendSha', 'protocolVersion', 'apiOrigin', 'environment', 'branch', 'apiOriginState']);
for (const key of Object.keys(config)) {
  if (!allowed.has(key)) {
    console.error(`Unexpected public runtime config field: ${key}`);
    process.exit(1);
  }
}

if (typeof config.frontendSha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(config.frontendSha)) {
  console.error('frontendSha must be a Git SHA string');
  process.exit(1);
}
if (config.protocolVersion !== '1') {
  console.error('protocolVersion must be the supported public protocol version "1"');
  process.exit(1);
}
if (config.environment !== 'production' || config.branch !== 'threejs-rebuild') {
  console.error('Production Pages metadata must identify the production environment and threejs-rebuild source branch');
  process.exit(1);
}
if (!['configured', 'absent', 'invalid'].includes(config.apiOriginState)) {
  console.error('apiOriginState must be configured, absent, or invalid');
  process.exit(1);
}

if (config.apiOrigin === null) {
  if (config.apiOriginState === 'configured') {
    console.error('Configured API_ORIGIN may not be null');
    process.exit(1);
  }
} else {
  if (typeof config.apiOrigin !== 'string') {
    console.error('apiOrigin must be a string or null');
    process.exit(1);
  }
  let url;
  try { url = new URL(config.apiOrigin); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || url.origin !== config.apiOrigin || url.username || url.password) {
    console.error('apiOrigin must be a credential-free HTTPS origin');
    process.exit(1);
  }
  if (/(^|\.)vercel\.app$/i.test(url.hostname)) {
    console.error('Vercel API origins are forbidden after the Pages backend cutover');
    process.exit(1);
  }
  if (config.apiOriginState !== 'configured') {
    console.error('A non-null apiOrigin must have apiOriginState=configured');
    process.exit(1);
  }
}
NODE

echo "PAGES-009 public artifact scan passed: ${site_dir}"
