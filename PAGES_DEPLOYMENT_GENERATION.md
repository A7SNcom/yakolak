# PAGES-014 Deployment Generation Contract

Status: **LOCKED by PAGES-014**

One Pages deployment generation is bound to the exact Godot `[flash-ready]` root SHA, exact `threejs-rebuild` candidate SHA, and SHA-256 of the exact public `threejs/runtime-config.json`.

```text
sha256(
  "pages-deployment-generation-v1\n" +
  GODOT_ROOT_SHA + "\n" +
  THREEJS_CANDIDATE_SHA + "\n" +
  PUBLIC_RUNTIME_PROTOCOL_SHA256 + "\n"
)
```

The value is serialized as `sha256:<hex>` in public `/deployment-manifest.json`, together with the exact source SHAs, public runtime/protocol hash and protocol version, and canonical public content identity. The content identity hashes a sorted manifest of all public files except `deployment-manifest.json` itself, avoiding self-reference.

Immediately before `deploy-pages`, the deploy job re-fetches the latest deployable root and Three.js candidate and recomputes the desired generation. If it differs from the composed artifact, the run ends as expected `SUPERSEDED` without invoking `deploy-pages`.

After GitHub reports the Pages deployment successful, acceptance polls the public manifest with cache bypass/revalidation until the requested generation is actually live. Temporary 404/old-generation responses are pre-readiness; exhausting the readiness window with a mismatch is a real failure.

PAGES-014 never edits or re-uploads a PAGES-012 immutable release. Post-deploy qualification downloads the already verified immutable `pages-composite.tar`, verifies GitHub release immutability/attestation and the recorded archive SHA-256, restores the exact bytes, recomputes runtime hash + generation + canonical content identity, and appends `deployment_generation_verified` to `RELEASE_QUALIFICATION/ledger.jsonl` only for an exact match. No matching archive means no pending placeholder is written.

Operational implementation:

- `.github/workflows/pages-single-site.yml`: compose, generation manifest, immediate supersession guard, deploy, readiness/live acceptance.
- `.github/workflows/pages-014-post-deploy-qualification.yml`: exact-byte immutable archive matching and additive qualification.
- `tests/pages_deployment_generation.test.mjs`: deterministic generation/content-identity regression coverage on `threejs-rebuild`.
