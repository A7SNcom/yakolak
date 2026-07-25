import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MOBILE_BOARD_STYLE,
  boardStyleFor
} from '../src/mobile-clarity-v120.js';

const [wrapper, app, index, version] = await Promise.all([
  readFile(new URL('../src/app-game-v114.js', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../version.json', import.meta.url), 'utf8').then(JSON.parse)
]);

const base = {
  color: '#4a5562',
  roughness: 0.48,
  metalness: 0,
  emissive: '#25313d',
  emissiveIntensity: 0.2
};

const desktop = boardStyleFor(base, false);
assert.equal(desktop, base, 'desktop must keep the exact established material object');

const mobile = boardStyleFor(base, true);
assert.notEqual(mobile, base);
assert.equal(mobile.color, '#5b6875');
assert.equal(mobile.emissive, '#1f2b36');
assert.equal(mobile.emissiveIntensity, 0.08);
assert.equal(mobile.roughness, base.roughness);
assert.equal(mobile.metalness, base.metalness);

function luminance(hex) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const bluePiece = '#001f8f';
assert.ok(
  contrast(MOBILE_BOARD_STYLE.color, bluePiece) > contrast(base.color, bluePiece) * 1.25,
  'mobile board must improve blue-piece separation by at least 25%'
);

assert.match(wrapper, /__yakolakMobileClarityV120\?\.boardStyleFor/);
assert.match(wrapper, /if\(MOBILE_HIGH_QUALITY\)return Math\.min\(dpr,1\.5\)/);
assert.match(wrapper, /return Math\.min\(dpr,1\.15\)/);
assert.doesNotMatch(wrapper, /shadowMap\.enabled=true|EffectComposer|postProcessingAdded:\s*1/i);
assert.match(app, /mobile-clarity-v120\.js/);
assert.match(index, /yakolak-version" content="v120-mobile-board-separation"/);
assert.match(index, /const BUILD='120'/);
assert.equal(version.build, 120);
assert.equal(version.version, 'v120-mobile-board-separation');

assert.deepEqual(globalThis.__yakolakMobileClarityV120.renderCost, {
  pixelRatioChange: 0,
  shadowsAdded: 0,
  lightsAdded: 0,
  drawCallsAdded: 0,
  postProcessingAdded: 0
});

console.log('v120 mobile-only board separation passed without added render cost');
