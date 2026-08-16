# Third-Party Notices — Three.js Rebuild

Scope: `threejs-rebuild` static browser client.

## Three.js

- Project: Three.js
- Package version: `0.185.1`
- Release tag: `r185`
- Pinned upstream commit: `2431a09f46f34c560bc8e44b33be0e567723d5b9`
- Source repository: `https://github.com/mrdoob/three.js`
- License: MIT
- Local license copy: `web/vendor/three/r185/LICENSE`

Vendored runtime files:

| Local path | Upstream path | Git blob SHA |
| --- | --- | --- |
| `web/vendor/three/r185/three.module.js` | `build/three.module.js` | `ad13abf7d128bee607a7672646ca543327e258d3` |
| `web/vendor/three/r185/three.core.js` | `build/three.core.js` | `0bb9262cd029f411933d077fd44197a51ec5e8e9` |
| `web/vendor/three/r185/addons/loaders/STLLoader.js` | `examples/jsm/loaders/STLLoader.js` | `45f8ddfcab5882d938cceb0527e83a6a586bfd17` |
| `web/vendor/three/r185/LICENSE` | `LICENSE` | `8ada2a5f982916b0ba4b7a0aa7de347587e745d7` |

### Addon selection

`STLLoader` is the only Three.js addon vendored for this migration baseline. The definitive portable-kit manifest requires the board, player bases, three piece sizes, and score marker as `.stl` models. No other Three.js addon is currently required by that asset contract, so controls, GLTF/DRACO/KTX loaders, post-processing modules, and other example addons are intentionally not vendored.

### Runtime dependency rule

The browser import map resolves `three` and `three/addons/` only to `web/vendor/three/r185/`. Runtime code must not load Three.js from npm, a package-manager resolver, `latest`, unpkg, jsDelivr, esm.sh, skypack, or any other CDN. Ordinary HTML/CSS/JS edits remain browser-native ES modules with no frontend bundle/build step.

The acquisition workflow also fetches from the immutable upstream commit above and verifies the exact Git blob hashes before committing any vendor bytes.
