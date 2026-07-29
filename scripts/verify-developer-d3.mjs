import fs from 'node:fs';

for(const file of ['developer.html','src/developer-d3.css','src/developer-d3.js','src/developer-d2-registry.js']){
  if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
}
const html=fs.readFileSync('developer.html','utf8');
if(html.includes('developer-d3-task-workspace')||html.includes('id="d3PreviewFrame"')||html.includes('src/developer-d3.js')){
  throw new Error('Legacy D3 workspace must not boot in the live page');
}
if(!html.includes('id="contentGrid"')||!html.includes('id="contentModal"'))throw new Error('Minimal card workspace is missing');
if(process.env.CI)fs.copyFileSync('developer.html','developer-d3.html');
console.log('Legacy D3 files are retained but excluded from the live page.');
