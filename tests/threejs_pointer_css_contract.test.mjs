import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'web/styles/app.css'), 'utf8');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');

const baseScene = css.match(/\.scene\s*\{([\s\S]*?)\}/)?.[1] || '';
const ownedScene = css.match(/\.scene\[data-gesture-owner="gameplay"\]\s*\{([\s\S]*?)\}/)?.[1] || '';

assert.match(baseScene, /touch-action:\s*auto\s*;/, 'canvas must preserve native gestures by default');
assert.doesNotMatch(baseScene, /touch-action:\s*none\s*;/, 'canvas must not suppress gestures globally');
assert.match(ownedScene, /touch-action:\s*none\s*;/, 'only explicit gameplay ownership suppresses browser gestures');
assert.match(html, /name="viewport"[^>]*viewport-fit=cover/, 'safe-area viewport contract must remain enabled');

console.log('THREEJS-030 pointer CSS ownership contract: PASS');
