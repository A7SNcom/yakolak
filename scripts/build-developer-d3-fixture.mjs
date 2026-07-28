import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const D3_FIXTURE_PATH='developer-d3.html';

export function buildDeveloperD3Fixture(source=fs.readFileSync(new URL('../developer.html',import.meta.url),'utf8')){
  let html=source
    .replaceAll('d4-next-action','d3-focus-action')
    .replaceAll('d4-next-actions','d3-focus-actions')
    .replaceAll('d4-next-copy','d3-focus-copy')
    .replaceAll('d4-next','d3-focus-card')
    .replaceAll('d4','d3')
    .replaceAll('D4','D3');
  html=html
    .replaceAll('developer-d3-variant-workspace','developer-d3-task-workspace')
    .replaceAll('./src/developer-d3.css?v=D3-variant-workspace','./src/developer-d3.css?v=D3-task-workspace')
    .replaceAll('./src/developer-d3.js?v=D3-variant-workspace','./src/developer-d3.js?v=D3-task-workspace')
    .replace(/\s*<label id="d3VariantField"[\s\S]*?<\/label>/,'');
  for(const marker of['developer-d3-task-workspace','id="d3PreviewFrame"','id="d3StartTask"','src/developer-d3.css','src/developer-d3.js']){
    if(!html.includes(marker))throw new Error(`Generated D3 fixture missing ${marker}`);
  }
  if(/\bd4[A-Z-]/.test(html)||html.includes('developer-d4'))throw new Error('Generated D3 fixture contains D4 shell markers');
  return html;
}

export function writeDeveloperD3Fixture(output=D3_FIXTURE_PATH){
  const html=buildDeveloperD3Fixture();
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,html);
  return html;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  writeDeveloperD3Fixture();
  console.log(`Generated ${D3_FIXTURE_PATH}`);
}
