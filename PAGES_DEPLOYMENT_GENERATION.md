# PAGES-014 Deployment Generation Contract

Status: **LOCKED by PAGES-014**

## Generation identity

One Pages deployment generation is identified by exactly three immutable inputs:

1. the exact Godot `[flash-ready]` root commit SHA;
2. the exact `threejs-rebuild` candidate commit SHA;
3. the SHA-256 of the exact public `threejs/runtime-config.json`, which carries the public protocol version and harmless `API_ORIGIN` state.

The canonical generation is:

```text
sha256(
  "pages-deployment-generation-v1\n" +
  GODOT_ROOT_SHA + "\n" +
  THREEJS_CANDIDATE_SHA + "\n" +
  PUBLIC_RUNTIME_PROTOCOL_SHA256 + "\n"
)
```

It is serialized as `sha256:<hex>` in `/deployment-manifest.json`.

## Public deployment manifest

Every composed Pages artifact publishes a harmless `/deployment-manifest.json` containing:

- `deploymentGeneration`;
- exact Godot root SHA;
- exact Three.js candidate SHA;
- public runtime/protocol SHA-256 and protocol version;
- a canonical content identity SHA-256.

The content identity is the SHA-256 of a sorted `sha256  relative/path` manifest of all public artifact files **except `deployment-manifest.json` itself**. Excluding the manifest prevents self-reference while still allowing an immutable archive to prove that its restored public bytes are the same generation.

No secret, credential, database configuration, bearer value, or privileged backend value belongs in this manifest.

## Supersession rule

Immediately before `actions/deploy-pages`, the deployment job fetches the latest deployable inputs and recomputes the desired generation.

- If it equals the composed generation, deployment may proceed.
- If it differs, the run ends as expected `SUPERSEDED` and does **not** invoke `deploy-pages`.

`SUPERSEDED` is not an application failure. Compose, scan, deployment, or final live-manifest mismatch remains a real failure.

## Readiness and live acceptance

`actions/deploy-pages@v4` waits for the Pages deployment API to report success. PAGES-014 then independently polls the public manifest because a successful Pages deployment can precede CDN/public readiness.

Acceptance requires a cache-bypassed/revalidated fetch of `deployment-manifest.json` whose generation, exact SHAs, runtime/protocol hash, and content identity equal the requested deployment. Root, `/threejs/`, and `runtime-config.json` are then smoke-tested against the same identity.

A temporary 404 or a previously live generation during propagation is pre-readiness, not an application failure. Exhausting the readiness window with a final mismatch is a failure.

## Immutable release qualification

PAGES-012 release bytes are never edited or re-uploaded by PAGES-014.

After a live desired generation is proven, PAGES-014 may append `deployment_generation_verified` only to `RELEASE_QUALIFICATION/ledger.jsonl`, keyed by the exact PAGES-012 `releaseTag` + `assetSha256`.

Archive matching is based on the **restored immutable bytes**, not on assuming PAGES-012 and PAGES-014 use the same higher-level manifest hash convention:

1. the existing `archive_verified` row must already prove release immutability/attestation/SHA-256/restore;
2. the release must still report Immutable and pass GitHub release verification;
3. the downloaded `pages-composite.tar` SHA-256 must equal the ledger key and `IMMUTABLE_FACTS.json`;
4. restored source SHAs must equal the live generation SHAs;
5. restored `threejs/runtime-config.json` SHA-256 must equal the live runtime/protocol hash;
6. the generation recomputed from restored bytes must equal the live generation;
7. the restored canonical content identity, excluding `deployment-manifest.json`, must equal the live manifest content identity;
8. if the archive itself contains `deployment-manifest.json`, that archived manifest must also identify the same generation/content identity.

Only then is a verified additive ledger event appended. If PAGES-012 has not yet produced an exact matching immutable archive, PAGES-014 writes **no pending placeholder** and leaves the deployment valid but unqualified.

## Ownership

- `.github/workflows/pages-single-site.yml` owns compose, immediate supersession prevention, deployment, public readiness, and live manifest acceptance.
- `.github/workflows/pages-014-post-deploy-qualification.yml` owns exact-byte immutable archive matching and additive deployment-generation qualification.
- `RELEASE_QUALIFICATION/ledger.jsonl` remains append-only.
- PAGES-012 owns immutable release creation and archive verification; PAGES-014 never mutates those release bytes.
