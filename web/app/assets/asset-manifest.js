// THREEJS-015 — runtime assets derived exactly from YAKOLAK_PORTABLE_KIT/assets/manifest.json.
// The portable kit is canonical; runtime payload metadata may point at deterministic derived assets.

export const PORTABLE_MANIFEST = Object.freeze({
  path: 'YAKOLAK_PORTABLE_KIT/assets/manifest.json',
  gitBlobSha: '94df861ea26879f05e1a5f1c88cb4e9ede66be7a',
  status: 'definitive',
});

export const ASSET_GROUPS = Object.freeze({
  'boot-critical': Object.freeze({ blocking: true, description: 'Required data/branding before renderer composition.' }),
  'scene-critical': Object.freeze({ blocking: true, description: 'Required geometry/layout before any playable scene is exposed.' }),
  optional: Object.freeze({ blocking: false, description: 'Presentation-only assets that may degrade safely.' }),
});

const RUNTIME_ROOT = '/runtime-assets';

function source(path, role, required, gitBlobSha, bytes) {
  return Object.freeze({ path, role, required, gitBlobSha, bytes });
}

function runtime(path, type, gitBlobSha, bytes) {
  const urlPath = path.startsWith('/') ? path : `${RUNTIME_ROOT}/${path}`;
  return Object.freeze({
    url: `${urlPath}?v=${gitBlobSha}`,
    type,
    ready: true,
    versionId: `git:${gitBlobSha}`,
    integrity: `git-blob-sha1:${gitBlobSha}`,
    gitBlobSha,
    bytes,
  });
}

function asset(logicalId, group, sourceInfo, type, runtimeOverride = null) {
  return Object.freeze({
    logicalId,
    group,
    source: sourceInfo,
    runtime: runtimeOverride || runtime(sourceInfo.path, type, sourceInfo.gitBlobSha, sourceInfo.bytes),
    runtimeRequired: sourceInfo.required,
  });
}

const boardAndLidSource = source('models/board-and-lid.stl', 'board-and-intro-lid', true, '024d109cea081d65eedc067b2fdaac46c9c10227', 3114084);
const boardAndLidRuntime = runtime('/assets/models/board-and-lid.glb', 'glb-components', '9a7e3410f641735e08a2944efa366cca2a66ee99', 2595544);
const playerBaseSource = source('models/player-base.stl', 'player-base', true, '066b3f95f5281a178b610611075cbab0689cdb12', 9955084);
const playerBaseRuntime = runtime('/assets/models/player-base.glb', 'glb-components', '63550f0eeb7aa9c004f251fb4238d751dfd4d06c', 1942888);

export const ASSETS = Object.freeze({
  gameLogo: asset('brand.yakolak-logo', 'boot-critical', source('logos/YAKOLAK.svg', 'official-game-logo', true, 'ee3703615cd42c4979a0001f1261014f108c6956', 5736), 'text'),
  companyLogo: asset('brand.mtkyf-logo', 'boot-critical', source('logos/MTKYF.svg', 'official-company-logo', true, '98b4ef63d06cbeb045d72895e6252143a5fce0a4', 8652), 'text'),
  loadingStar: asset('ui.loading-star', 'boot-critical', source('ui/loading-star.svg', 'approved-loading-symbol', true, 'fb9b40a07c184a5c8aefb8c138ccd2c9f98c3eeb', 643), 'text'),
  roomSpec: asset('scene.room-spec', 'boot-critical', source('room/ROOM.md', 'generated-room-specification', true, '408382524358e1347427c8e5b956a682b9ac5d63', 843), 'text'),
  worldLayout: asset('data.world-layout', 'boot-critical', source('layout/world-layout.json', 'authoritative-spatial-and-camera-data', true, '03c7b0be0ade8360897a681127aab8caf1bc2248', 2645), 'json'),
  approvedContract: asset('data.approved-contract', 'boot-critical', source('reference/approved-contract.json', 'rules-materials-lighting-icons-audio-motion-network-reference', true, '46f2ce804dab8d77f4d1287746c180fa2b38fee4', 5261), 'json'),

  introScatter: asset('data.intro-scatter', 'scene-critical', source('layout/intro-scatter.csv', 'exact-36-piece-intro-start-transforms', true, '429265cd6a5c5474bdfa75c811963c743a057bd8', 2452), 'text'),
  boardAndLid: asset('model.board-and-lid', 'scene-critical', boardAndLidSource, 'stl', boardAndLidRuntime),
  playerBase: asset('model.player-base', 'scene-critical', playerBaseSource, 'stl', playerBaseRuntime),
  pieceSmall: asset('model.piece-small', 'scene-critical', source('models/piece-small.stl', 'small-piece', true, '531812323efe43f7679f509f1ae06980227521a8', 5884), 'stl'),
  pieceMedium: asset('model.piece-medium', 'scene-critical', source('models/piece-medium.stl', 'medium-piece', true, 'c32fc5cc37664af7860b3aa6e33e12b04eefa757', 12084), 'stl'),
  pieceLarge: asset('model.piece-large', 'scene-critical', source('models/piece-large.stl', 'large-piece', true, 'eca0a269a75aef8770a8eb653e016f69b7766b35', 12084), 'stl'),
  scoreMarker: asset('model.score-marker', 'scene-critical', source('models/score-marker.stl', 'score-point', true, 'feb5d59eafe4547a529876344ff88d05ca95b37c', 12884), 'stl'),
  tableFootprint: asset('scene.table-footprint', 'scene-critical', source('table/table.svg', 'extruded-table-footprint', true, '1591a82d2f3498f25a566f650b4f2d7f9787b1e9', 1057), 'text'),

  tableAlbedo: asset('texture.table-albedo', 'optional', source('table/albedo.png', 'table-albedo', false, '4a0a43903e308d1443eb4ae735e22ceb908af0c6', 5062989), 'png'),
  tableNormal: asset('texture.table-normal', 'optional', source('table/normal.png', 'table-normal', false, '40cbff6ced0b58257e2c0746be66b5e687059ead', 5887287), 'png'),
  tableRoughness: asset('texture.table-roughness', 'optional', source('table/roughness.png', 'table-roughness', false, 'c77d0e2b64e1180c1352c716aad642a1043298af', 3532328), 'png'),
  roomPlan: asset('reference.room-plan', 'optional', source('room/room-plan.svg', 'room-top-view-reference', false, '332a9cdef3685dbdd8a77cf1fbd32d6f9d8f3d89', 1117), 'text'),
});

export const ASSET_LIST = Object.freeze(Object.values(ASSETS));
export const assetsForGroup = (group) => ASSET_LIST.filter((entry) => entry.group === group);
export const unavailableRequiredAssets = (group) => assetsForGroup(group).filter((entry) => entry.runtimeRequired && !entry.runtime.ready);
export const runtimePayloadBytes = (asset) => asset.runtime.bytes ?? asset.source.bytes;
export const runtimePayloadGitBlobSha = (asset) => asset.runtime.gitBlobSha ?? asset.source.gitBlobSha;
