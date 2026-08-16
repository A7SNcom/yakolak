import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const appRoot = path.join(root, 'web', 'app');
const rendererPath = path.join(appRoot, 'scene', 'renderer.js');
const governorPath = path.join(appRoot, 'camera', 'frame-governor.js');
const bootPath = path.join(appRoot, 'boot', 'boot.js');
const htmlPath = path.join(root, 'web', 'index.html');

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  }));
  return nested.flat();
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

const files = await collectJavaScriptFiles(appRoot);
const sources = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')])));
const renderer = await readFile(rendererPath, 'utf8');
const governor = await readFile(governorPath, 'utf8');
const boot = await readFile(bootPath, 'utf8');
const html = await readFile(htmlPath, 'utf8');
const authoredSource = [...sources.values()].join('\n');

assert.equal(occurrences(authoredSource, "document.createElement('canvas')"), 1, 'exactly one authored canvas creator is allowed');
assert.equal(occurrences(authoredSource, 'new THREE.WebGLRenderer'), 1, 'exactly one WebGLRenderer constructor is allowed');
assert.equal(occurrences(html.toLowerCase(), '<canvas'), 0, 'HTML must not create a competing canvas');
assert.match(renderer, /getContext\('webgl2', WEBGL2_CONTEXT_ATTRIBUTES\)/, 'WebGL2 must be acquired from the owned canvas');
assert.match(renderer, /renderer\.outputColorSpace = THREE\.SRGBColorSpace/, 'output color space must be centralized');
assert.match(renderer, /renderer\.toneMapping = THREE\.ACESFilmicToneMapping/, 'tone mapping must be centralized');
assert.match(renderer, /renderer\.toneMappingExposure = RENDERER_BASELINE\.toneMappingExposure/, 'exposure must be centralized');
assert.match(renderer, /renderer\.setClearColor\(RENDERER_BASELINE\.clearColor, RENDERER_BASELINE\.clearAlpha\)/, 'clear state must be centralized');
assert.match(governor, /maxPixelRatio: 1\.5/, 'mobile-first DPR cap must stay explicit in the presentation governor');
assert.match(renderer, /stencil: false/, 'mobile-first context must not allocate stencil by default');
assert.match(renderer, /preserveDrawingBuffer: false/, 'mobile-first context must not preserve the drawing buffer');
assert.match(renderer, /if \(activeOwner && !activeOwner\.disposed\)/, 'a second renderer owner must be rejected');
assert.match(renderer, /mount\.querySelector\('canvas'\)/, 'a second canvas in the renderer mount must be rejected');
assert.match(renderer, /__YAKOLAK_RENDERER_INFO__/, 'renderer.info diagnostics hook must be owned here');
assert.match(boot, /buildInfo\.environment !== 'production'/, 'renderer.info diagnostics must stay non-production only');
assert.match(boot, /rendererOwner\.exposeDevelopmentDiagnostics\(window\)/, 'boot must explicitly opt into diagnostics');
assert.doesNotMatch(authoredSource, /three\/addons\/postprocessing|EffectComposer|RenderPass|OutputPass|UnrealBloomPass/, 'post-processing is prohibited until a measured later task authorizes it');

console.log('Verified single WebGL2 renderer owner contract');
