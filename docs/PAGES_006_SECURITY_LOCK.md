# PAGES-006 Security Lock Marker

PAGES-006 is complete and locked by `PAGES_ORIGIN_STORAGE_SECURITY.md`.

Future GitHub Pages and Three.js migration work must preserve these invariants:

- browser origin is `https://a7sncom.github.io`; paths are not separate security origins;
- authorization is backend-validated high-entropy seat authority, never CORS/path trust;
- all YAKOLAK browser persistence surfaces use the `YAKOLAK` namespace;
- no broad `clear()` operations on LocalStorage, IndexedDB, CacheStorage, or related shared-origin surfaces;
- seat bearer credentials are memory-only and are not persisted in browser storage;
- takeover/recovery must rotate/revoke authoritative seat credentials server-side;
- datastore/admin credentials remain backend-only and must never enter Pages artifacts or Actions logs;
- `.github/workflows/pages-006-origin-security.yml` and `tests/pages_origin_storage_security.test.mjs` are the regression gate.

This marker exists so later parallel migration tasks can discover the completed security contract without rewriting shared migration documents.