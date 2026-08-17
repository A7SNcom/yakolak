# Vercel Git Deployments Disabled

Status: **LOCKED — 2026-08-17**

YAKOLAK frontend delivery is owned by GitHub Pages. Cloudflare Workers + Turso own the future online backend boundary. Vercel is historical evidence only and must not receive automatic Git deployments from this repository.

Repository guardrails:

- `vercel.json` on `main` sets `git.deploymentEnabled=false` and `ignoreCommand="exit 0"`.
- `vercel.json` on `threejs-rebuild` sets `git.deploymentEnabled=false` and `ignoreCommand="exit 0"`.
- No future task may re-enable Vercel Git deployment for `main`, `threejs-rebuild`, or any wildcard branch.
- No Vercel alias, preview, or deployment may be used as YAKOLAK migration acceptance evidence after this lock.
- GitHub Pages remains the only frontend publishing target; `API_ORIGIN` remains the only frontend/backend boundary.

If historical Vercel records are retained, they are read-only migration evidence and do not authorize new deployments.
