// THREEJS-015 — runtime manifest derived from YAKOLAK_PORTABLE_KIT/assets/manifest.json.
// The portable kit remains canonical. Runtime copies/conversions are presentation artifacts only.

export const PORTABLE_MANIFEST = Object.freeze({
  path: 'YAKOLAK_PORTABLE_KIT/assets/manifest.json',
  gitBlobSha: '94df861ea26879f05e1a5f1c88cb4e9ede66be7a',
  status: 'definitive',
});

export const ASSET_GROUPS = Object.freeze({
  'boot-critical': Object.freeze({ blocking: true, description: 'Required before application composition can safely continue.' }),
  'scene-critical': Object.freeze({ blocking: true, description: 'Required before the complete playable scene may be exposed.' }),
  optional: Object.freeze({ blocking: false, description: 'May fail or be absent without inventing gameplay state.' }),
});

function source(path, role, required, gitBlobSha, bytes) {
  return Object.freeze({ path, role, required, gitBlobSha, bytes });
}

function runtime({ url = null, type, ready = false, plannedUrl = null, note = null }) {
  return Object.freeze({ url, type, ready, plannedUrl, note });
}

function asset(logicalId, group, sourceInfo, runtimeInfo, runtimeRequired = sourceInfo.required) {
  return Object.freeze({ logicalId, group, source: sourceInfo, runtime: runtimeInfo, runtimeRequired });
}

const v = (sha) => sha.slice(0, 12);
const versioned = (path, sha) => `${path}?v=${v(sha)}`;

export const ASSETS = Object.freeze({
  loadingStar: asset(
    'ui.loading-star', 'boot-critical',
    source('ui/loading-star.svg', 'approved-loading-symbol', true, 'fb9b40a07c184a5c8aefb8c138ccd2c9f98c3eeb', 643),
    runtime({ url: versioned('/assets/kit/ui/loading-star.svg', 'fb9b40a07c184a5c8aefb8c138ccd2c9f98c3eeb'), type: 'text', ready: true }),
  ),
  worldLayout: asset(
    'data.world-layout', 'boot-critical',
    source('layout/world-layout.json', 'authoritative-spatial-and-camera-data', true, '03c7b0be0ade8360897a681127aab8caf1bc2248', 2645),
    runtime({ url: versioned('/assets/kit/layout/world-layout.json', '03c7b0be0ade8360897a681127aab8caf1bc2248'), type: 'json', ready: true }),
  ),
  approvedContract: asset(
    'data.approved-contract', 'boot-critical',
    source('reference/approved-contract.json', 'rules-materials-lighting-icons-audio-motion-network-reference', true, '46f2ce804dab8d77f4d1287746c180fa2b38fee4', 5261),
    runtime({ url: versioned('/assets/kit/reference/approved-contract.json', '46f2ce804dab8d77f4d1287746c180fa2b38fee4'), type: 'json', ready: true }),
  ),
  introScatter: asset(
    'data.intro-scatter', 'scene-critical',
    source('layout/intro-scatter.csv', 'exact-36-piece-intro-start-transforms', true, '429265cd6a5c5474bdfa75c811963c743a057bd8', 2452),
    runtime({ url: versioned('/assets/kit/layout/intro-scatter.csv', '429265cd6a5c5474bdfa75c811963c743a057bd8'), type: 'text', ready: true }),
  ),
  tableFootprint: asset(
    'scene.table-footprint', 'scene-critical',
    source('table/table.svg', 'extruded-table-footprint', true, '1591a82d2f3498f25a566f650b4f2d7f9787b1e9', 1057),
    runtime({ url: versioned('/assets/kit/table/table.svg', '1591a82d2f3498f25a566f650b4f2d7f9787b1e9'), type: 'text', ready: true }),
  ),
  gameLogo: asset(
    'brand.yakolak-logo', 'scene-critical',
    source('logos/YAKOLAK.svg', 'official-game-logo', true, 'ee3703615cd42c4979a0001f1261014f108c6956', 5736),
    runtime({ type: 'text', ready: false, plannedUrl: '/assets/runtime/brand/YAKOLAK.svg', note: 'Runtime brand staging remains pending; do not fetch from GitHub/CDN.' }),
  ),
  companyLogo: asset(
    'brand.mtkyf-logo', 'scene-critical',
    source('logos/MTKYF.svg', 'official-company-logo', true, '98b4ef63d06cbeb045d72895e6252143a5fce0a4', 8652),
    runtime({ type: 'text', ready: false, plannedUrl: '/assets/runtime/brand/MTKYF.svg', note: 'Runtime brand staging remains pending; do not fetch from GitHub/CDN.' }),
  ),
  boardAndLid: asset(
    'model.board-and-lid', 'scene-critical',
    source('models/board-and-lid.stl', 'board-and-intro-lid', true, '024d109cea081d65eedc067b2fdaac46c9c10227', 3114084),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/board-and-lid.glb', note: 'THREEJS-016/018 own deterministic conversion and verification.' }),
  ),
  playerBase: asset(
    'model.player-base', 'scene-critical',
    source('models/player-base.stl', 'player-base', true, '066b3f95f5281a178b610611075cbab0689cdb12', 9955084),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/player-base.glb', note: 'THREEJS-016/019 own deterministic conversion and verification.' }),
  ),
  pieceSmall: asset(
    'model.piece-small', 'scene-critical',
    source('models/piece-small.stl', 'small-piece', true, '531812323efe43f7679f509f1ae06980227521a8', 5884),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/piece-small.glb', note: 'THREEJS-016/020 own deterministic conversion and verification.' }),
  ),
  pieceMedium: asset(
    'model.piece-medium', 'scene-critical',
    source('models/piece-medium.stl', 'medium-piece', true, 'c32fc5cc37664af7860b3aa6e33e12b04eefa757', 12084),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/piece-medium.glb', note: 'THREEJS-016/020 own deterministic conversion and verification.' }),
  ),
  pieceLarge: asset(
    'model.piece-large', 'scene-critical',
    source('models/piece-large.stl', 'large-piece', true, 'eca0a269a75aef8770a8eb653e016f69b7766b35', 12084),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/piece-large.glb', note: 'THREEJS-016/020 own deterministic conversion and verification.' }),
  ),
  scoreMarker: asset(
    'model.score-marker', 'scene-critical',
    source('models/score-marker.stl', 'score-point', true, 'feb5d59eafe4547a529876344ff88d05ca95b37c', 12884),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/models/score-marker.glb', note: 'THREEJS-016/021 own deterministic conversion and verification.' }),
  ),
  roomSpec: asset(
    'scene.room-spec', 'scene-critical',
    source('room/ROOM.md', 'generated-room-specification', true, '408382524358e1347427c8e5b956a682b9ac5d63', 843),
    runtime({ type: 'text', ready: false, plannedUrl: '/assets/runtime/room/room-contract.json', note: 'Developer markdown is not a runtime dependency; THREEJS-022 owns the runtime room implementation.' }),
  ),
  tableAlbedo: asset(
    'texture.table-albedo', 'optional',
    source('table/albedo.png', 'table-albedo', false, '4a0a43903e308d1443eb4ae735e22ceb908af0c6', 5062989),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/table/albedo.webp', note: 'Optional optimization/conversion may be added later.' }), false,
  ),
  tableNormal: asset(
    'texture.table-normal', 'optional',
    source('table/normal.png', 'table-normal', false, '40cbff6ced0b58257e2c0746be66b5e687059ead', 5887287),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/table/normal.webp', note: 'Optional optimization/conversion may be added later.' }), false,
  ),
  tableRoughness: asset(
    'texture.table-roughness', 'optional',
    source('table/roughness.png', 'table-roughness', false, 'c77d0e2b64e1180c1352c716aad642a1043298af', 3532328),
    runtime({ type: 'arrayBuffer', ready: false, plannedUrl: '/assets/runtime/table/roughness.webp', note: 'Optional optimization/conversion may be added later.' }), false,
  ),
  roomPlan: asset(
    'reference.room-plan', 'optional',
    source('room/room-plan.svg', 'room-top-view-reference', false, '332a9cdef3685dbdd8a77cf1fbd32d6f9d8f3d89', 1117),
    runtime({ type: 'text', ready: false, plannedUrl: '/assets/runtime/reference/room-plan.svg', note: 'Reference-only asset; runtime may omit it.' }), false,
  ),
});

export const ASSET_LIST = Object.freeze(Object.values(ASSETS));
export const assetsForGroup = (group) => ASSET_LIST.filter((entry) => entry.group === group);
export const unavailableRequiredAssets = (group) => assetsForGroup(group).filter((entry) => entry.runtimeRequired && !entry.runtime.ready);
