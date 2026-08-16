# THREEJS-001 — Safe Migration Baseline

Frozen from the Godot Production deployment that was current when `threejs-rebuild` was created.

## Source of truth

- Canonical Production URL at baseline: https://yakolak.vercel.app/
- Immutable Production deployment URL: https://yakolak-b1evy5x1x-ahmdkcoms-projects.vercel.app
- Vercel deployment ID: dpl_BRayrP6BRbm2UQUbcLxAPXDVWE1j
- Production Git SHA / branch creation SHA: `04c75be60501778028e8107992e85c74d113b3da`
- Migration branch: `threejs-rebuild`
- Migration branch base SHA: `04c75be60501778028e8107992e85c74d113b3da`
- Latest `main` observed when capture completed: `04c75be60501778028e8107992e85c74d113b3da`
- Captured UTC: 2026-08-16T12:18:07Z
- Captured page title: Login – Vercel

## Isolation rule

Until explicit cutover, all Three.js rewrite work belongs only on `threejs-rebuild`. Do not merge, fast-forward, or deploy this branch to Production. Existing Godot `main` and the canonical Production alias remain the reference implementation.

## Reference screenshots

- `screenshots/production-320x568.png` — SHA-256 `416d806ca26c47fd7570d0f26e01d560222e35d4dd3f9a5f03acc84b81e96f26`
- `screenshots/production-390x844.png` — SHA-256 `28d7b51c787a8a5f3b173aab5b0b747c7b3842f5004ebd1ebac22edaa12f2749`
- `screenshots/production-1440x900.png` — SHA-256 `f355891db47691e802c34841ef841a56af113408253a84749c51256e82af9cea`

The screenshots come from the immutable deployment URL above, so they remain tied to `04c75be60501778028e8107992e85c74d113b3da` even if `main` or the canonical alias advances later.
