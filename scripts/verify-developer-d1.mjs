import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('developer.html');
const sceneHtml=read('developer-scene.html');
const gallery=read('src/developer-d1.js');
const runner=read('src/developer-scene-d1.js');

const requireText=(source,text,label)=>{if(!source.includes(text))throw new Error(`${label}: missing ${text}`)};
const rejectText=(source,text,label)=>{if(source.includes(text))throw new Error(`${label}: unexpected ${text}`)};

requireText(html,'D1 · DEVELOPMENT','D1 identity');
requireText(html,'id="sceneTabs"','scene filters');
requireText(html,'id="devBack"','floating return button');
requireText(html,'id="devStageFrame"','isolated stage');
requireText(sceneHtml,'loaderProjection','approved loading star');
requireText(sceneHtml,'@keyframes bounce','approved loading motion');

['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'].forEach(id=>requireText(gallery,`id:'${id}'`,'scene catalog'));
['all','single','sequence'].forEach(id=>requireText(gallery,`id:'${id}'`,'scene filters'));
requireText(gallery,'IntersectionObserver','lazy preview loading');
requireText(gallery,"stage.classList.add('open')",'scene open flow');
requireText(gallery,"stageFrame.src='about:blank'",'scene close cleanup');

requireText(runner,"sceneId==='loading-star'",'loading scene');
requireText(runner,'configureEmptyTable','empty table scene');
requireText(runner,'configureBoardBases','board bases scene');
requireText(runner,'configureLogoWall','logo wall scene');
requireText(runner,"sceneId==='clean-entry'",'entry sequence');
requireText(runner,'configureUnboxing','unboxing sequence');
requireText(runner,"document.body.dataset.sceneReady='true'",'scene readiness marker');

rejectText(html,'./app.js','client bootstrap isolation');
rejectText(sceneHtml,'./app.js','client bootstrap isolation');
console.log('Developer D1 static verification passed');
