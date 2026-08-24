import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const css = readFileSync(path.join(root, 'web/styles/app.css'), 'utf8');

assert.match(html, /id="game-hud"\s+class="[^"]*\bhud-panel\b[^"]*"/, 'live HUD must retain its status-panel identity');
assert.match(css, /\.hud-panel\s*\{[^}]*pointer-events\s*:\s*none\s*;/s, 'status HUD must pass pointer input through to the gameplay canvas');
assert.doesNotMatch(css, /\.hud-panel\s*\{[^}]*pointer-events\s*:\s*(?:auto|all)\s*;/s, 'HUD must not reclaim gameplay pointer input');

console.log('GAMEPREP-001 HUD pointer passthrough: PASS');
