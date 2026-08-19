#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
PAGES-015 legacy main archive helper is retired and must not mutate releases or RELEASE_QUALIFICATION.
Use the authoritative main PAGES-015 qualification orchestrator, which checks out threejs-rebuild and runs the Admin-gated v2 archive path under the shared qualification-ledger lock.
EOF
exit 64
