import fs from 'node:fs';

const read=file=>fs.readFileSync(file,'utf8');
for(const file of ['developer.html','src/developer-president.css','src/developer-president.js','src/developer-d4-registry.js']){
  if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
}
const html=read('developer.html'),css=read('src/developer-president.css'),js=read('src/developer-president.js');
const need=(source,value)=>{if(!source.includes(value))throw new Error(`Missing ${value}`)};
for(const value of ['id="contentGrid"','id="contentModal"','data-filter="scene"','data-filter="journey"','data-filter="element"','data-filter="task"'])need(html,value);
for(const value of ['previewUrlFor(','previewSourcesFor(','previewItemSelect','previewVersionSelect','payload.content','@media(max-width:760px)','[hidden]{display:none!important}'])need(js+css,value);
for(const legacy of ['id="d4PreviewFrame"','src/developer-d4.js','president-kanban','presidentPortal']){
  if(html.includes(legacy))throw new Error(`Legacy live shell remains: ${legacy}`);
}
console.log('Minimal card shell, Google Sheets content and retained preview renderer verified.');
