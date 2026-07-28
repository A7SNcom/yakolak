import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('developer.html');
const sceneHtml=read('developer-scene.html');
const gallery=read('src/developer-d1.js');
const registry=read('src/developer-d1-registry.js');
const runner=read('src/developer-scene-d1.js');
const api=read('api/developer-d1.js');

const requireText=(source,text,label)=>{if(!source.includes(text))throw new Error(`${label}: missing ${text}`)};
const rejectText=(source,text,label)=>{if(source.includes(text))throw new Error(`${label}: unexpected ${text}`)};

requireText(html,'D1 · DEVELOPMENT','D1 identity');
requireText(html,'id="sceneTabs"','scene filters');
requireText(html,'id="devBack"','floating return button');
requireText(html,'id="devStageFrame"','isolated stage');
requireText(html,'scene-preview-state','preview readiness state');
requireText(html,'id="devNotesToggle"','notes toggle');
requireText(html,'id="devEditor"','shared editor');
requireText(html,'id="devNameInput"','rename input');
requireText(html,'id="devNotesInput"','notes input');
requireText(html,'id="devSave"','explicit save');
requireText(html,'مخزن D1 المشترك','shared persistence disclosure');
requireText(sceneHtml,'loaderProjection','approved loading star');
requireText(sceneHtml,'@keyframes bounce','approved loading motion');

['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'].forEach(id=>requireText(registry,`id:'${id}'`,'scene registry'));
['base-large','base-small','stone-large','stone-medium','stone-small','loading-star-element','table','logo-yakolak','logo-mtkyf'].forEach(id=>requireText(registry,`id:'${id}'`,'element registry'));
['all','single','sequence','elements'].forEach(id=>requireText(gallery,`id:'${id}'`,'gallery filters'));
requireText(gallery,'developer-d1-registry.js','shared registry import');
requireText(gallery,"const API_URL='./api/developer-d1'",'shared API endpoint');
requireText(gallery,'IntersectionObserver','lazy preview loading');
requireText(gallery,"stage.classList.add('open')",'entity open flow');
requireText(gallery,"stageFrame.src='about:blank'",'entity close cleanup');
requireText(gallery,'yakolak-developer-scene-ready','preview readiness bridge');
requireText(gallery,'displayName(definition)','runtime rename mapping');
requireText(gallery,"method:'POST'",'shared notes save');
requireText(gallery,'localStorage.setItem','local fallback save');
requireText(gallery,'loadSharedState','shared notes restore');
requireText(gallery,'sourceKey:activeEditorEntity.sourceKey','code mapping persistence');

requireText(api,"@tursodatabase/serverless/compat",'Turso persistence');
requireText(api,"yakolak_developer_d1_entities",'entity storage table');
requireText(api,"yakolak_developer_d1_events",'event history table');
requireText(api,'sameOrigin(req)','same-origin public writes');
requireText(api,"res.setHeader('allow','GET, POST, OPTIONS')",'API methods');
requireText(api,"console.info('[Yakolak D1 shared feedback]'",'assistant-readable event log');

requireText(runner,"elementId=params.get('element')",'element route');
requireText(runner,'configureElement','element isolation');
requireText(runner,"id==='base-large'",'large base element');
requireText(runner,"'stone-small':'s'",'stone elements');
requireText(runner,'configureLogoElement','logo elements');
requireText(runner,'function hideTable(scene)','element table isolation');
requireText(runner,"tableHidden:'true'",'isolated element marker');
requireText(runner,"sceneId==='loading-star'||elementId==='loading-star-element'",'loading star scene and element');
requireText(runner,'configureEmptyTable','empty table scene');
requireText(runner,'configureBoardBases','board bases scene');
requireText(runner,'configureLogoWall','logo wall scene');
requireText(runner,"sceneId==='clean-entry'",'entry sequence');
requireText(runner,'configureUnboxing','unboxing sequence');
requireText(runner,"sceneReady:'true'",'entity readiness marker');
requireText(runner,"composition:'unboxing-only'",'intro-only isolation');
requireText(runner,"logoRendering:'svg-geometry-two-tone'",'two-tone logo rendering');
requireText(runner,"visibleObjects:String(selected.length)",'named board objects');

rejectText(html,'type="password"','password gate');
rejectText(html,'./app.js','client bootstrap isolation');
rejectText(sceneHtml,'./app.js','client bootstrap isolation');
console.log('Developer D1 shared notes, renaming, scenes, and isolated elements verification passed');
