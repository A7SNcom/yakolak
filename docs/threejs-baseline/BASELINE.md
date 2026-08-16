# THREEJS-001 — Safe Migration Baseline

Frozen from the Godot Production that was current when `threejs-rebuild` was created.

## Source of truth

- Canonical Production URL: https://yakolak.vercel.app/
- Vercel Production deployment URL: https://yakolak-b1evy5x1x-ahmdkcoms-projects.vercel.app
- Vercel deployment ID: dpl_BRayrP6BRbm2UQUbcLxAPXDVWE1j
- Production Git SHA / branch creation SHA: `04c75be60501778028e8107992e85c74d113b3da`
- Migration branch: `threejs-rebuild`
- Migration branch base SHA: `04c75be60501778028e8107992e85c74d113b3da`
- Latest `main` observed when capture completed: `04c75be60501778028e8107992e85c74d113b3da`
- Captured UTC: 2026-08-16T12:19:52Z
- Captured page title: YAKOLAK 2.6 Corrected Intro
- Capture validation: public Godot canvas present

## Isolation rule

Until explicit cutover, all Three.js rewrite work belongs only on `threejs-rebuild`. Do not merge, fast-forward, or deploy this branch to Production. Existing Godot `main` and the canonical Production alias remain the reference implementation.

## Reference screenshots

- `screenshots/production-320x568.png` — SHA-256 `4518eaf4416416cf23200813c78628c46f38b260ad4010d4903c62be0bfbdf37`
- `screenshots/production-390x844.png` — SHA-256 `a46f7180068b13c62eef158c5eb4b5b898a7c27f8e72d8c4716542e352923561`
- `screenshots/production-1440x900.png` — SHA-256 `dba7b25c571b49c609594fcbcdbd0aa423a084ca11f91ef405a42e193ae9baab`

These screenshots were captured from the public canonical Production URL while Vercel Production and `main` were both verified at `04c75be60501778028e8107992e85c74d113b3da`.
