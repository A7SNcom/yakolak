import fs from 'node:fs';
const files=['developer.html','src/developer-d2.css','src/developer-d2.js','src/developer-d2-registry.js','api/developer-d1-comparisons.js','docs/design/developer-d2-workbench-desktop.svg','docs/design/developer-d2-workbench-mobile.svg'];
for(const file of files){if(!fs.existsSync(file))throw new Error(`Missing ${file}`)}
const html=fs.readFileSync('developer.html','utf8');
const css=fs.readFileSync('src/developer-d2.css','utf8');
const js=fs.readFileSync('src/developer-d2.js','utf8');
if(!html.includes('developer-d2-workbench'))throw new Error('Missing D2 marker');
if((html.match(/d2PreviewFrame/g)||[]).length!==1)throw new Error('Expected one primary preview');
if(!html.includes('d2-navigator')||!html.includes('d2-canvas-shell')||!html.includes('d2-inspector'))throw new Error('Missing workbench regions');
if(!css.includes('@media(max-width:800px)')||!css.includes('prefers-reduced-motion'))throw new Error('Missing responsive or reduced motion rules');
if(!js.includes("itemKind:'entity'")||!js.includes("DRAWFLOW_VERSION='0.0.60'"))throw new Error('Missing comparison or board compatibility');
console.log('Developer D2 verification passed.');
