import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('developer.html');
const sceneHtml=read('developer-scene.html');
const gallery=read('src/developer-d1.js');
const registry=read('src/developer-d1-registry.js');
const runner=read('src/developer-scene-d1.js');
const runtime=read('src/app-game-developer-d1.js');
const api=read('api/developer-d1.js');

const requireText=(source,text,label)=>{if(!source.includes(text))throw new Error(`${label}: missing ${text}`)};
const rejectText=(source,text,label)=>{if(source.includes(text))throw new Error(`${label}: unexpected ${text}`)};

requireText(html,'D1 · DEVELOPMENT','D1 identity');
requireText(html,'id="sceneTabs"','scene filters');
requireText(html,'id="devBack"','floating return button');
requireText(html,'id="devStageFrame"','isolated stage');
requireText(html,'id="devEditor"','shared editor');
requireText(html,'id="devNameInput"','rename input');
requireText(html,'id="devNotesInput"','notes input');
requireText(html,'مخزن D1 المشترك','shared persistence disclosure');
requireText(sceneHtml,'loaderProjection','approved loading star');
requireText(sceneHtml,'@keyframes bounce','approved loading motion');
requireText(sceneHtml,'D1-review-fixes','review fixes cache marker');

['loading-star','empty-table','logo-wall','board-bases','clean-entry','unboxing-intro'].forEach(id=>requireText(registry,`id:'${id}'`,'scene registry'));
['base-large','base-small','stone-large','stone-medium','stone-small','loading-star-element','table','logo-yakolak','logo-mtkyf'].forEach(id=>requireText(registry,`id:'${id}'`,'element registry'));
[
  "defaultName:'الغرفة والطاولة'",
  "defaultName:'ميدان اللعب'",
  "defaultName:'منطقة الراحة'",
  "defaultName:'شوكة كبيرة'",
  "defaultName:'شوكة وسط'",
  "defaultName:'شوكة صغيرة'"
].forEach(text=>requireText(registry,text,'reviewed source naming'));

['all','single','sequence','elements'].forEach(id=>requireText(gallery,`id:'${id}'`,'gallery filters'));
requireText(gallery,'developer-d1-registry.js','shared registry import');
requireText(gallery,"const API_URL='./api/developer-d1'",'shared API endpoint');
requireText(gallery,'IntersectionObserver','lazy preview loading');
requireText(gallery,"stage.classList.add('open')",'entity open flow');
requireText(gallery,"stageFrame.src='about:blank'",'entity close cleanup');
requireText(gallery,'displayName(definition)','runtime rename mapping');
requireText(gallery,"method:'POST'",'shared notes save');
requireText(gallery,'loadSharedState','shared notes restore');
requireText(gallery,'sourceKey:activeEditorEntity.sourceKey','code mapping persistence');

requireText(api,"@tursodatabase/serverless/compat",'Turso persistence');
requireText(api,"yakolak_developer_d1_entities",'entity storage table');
requireText(api,"yakolak_developer_d1_events",'event history table');
requireText(api,'sameOrigin(req)','same-origin public writes');
requireText(api,"console.info('[Yakolak D1 shared feedback]'",'assistant-readable event log');

requireText(runtime,'allow D1 wall camera targets','wall target clamp patch');
requireText(runtime,'ROOM_LIMIT.minX','room-wide target limits');
requireText(runtime,'THREE,controls,meshes','D1 controls bridge');
requireText(runtime,'__yakolakDeveloperD1Runtime','D1 runtime marker');

requireText(runner,"const TABLE_COLOR='#c2c3bf'",'balanced table color');
requireText(runner,'function styleRoomOutlines','four-wall outline styling');
requireText(runner,"roomOutlineLines:String(styleRoomOutlines(scene))",'outline readiness marker');
requireText(runner,"zoomContinuity:'stable-controls-target'",'logo wall zoom continuity');
requireText(runner,"largeBaseVisible:String(Boolean(game.meshes?.['9']?.visible))",'unboxing main base visibility');
requireText(runner,"cameraMotion:'single-position-target-bezier'",'continuous entry motion');
requireText(runner,"continuity:'no-cuts'",'entry no-cuts contract');
requireText(runner,"import('./app-game-developer-d1.js?v=D1-review-fixes')",'isolated D1 runtime');
requireText(runner,'configureElement','element isolation');
requireText(runner,"sceneId==='loading-star'||elementId==='loading-star-element'",'loading star scene and element');
requireText(runner,"composition:'unboxing-only'",'intro-only isolation');
requireText(runner,"logoRendering:'svg-geometry-two-tone'",'two-tone logo rendering');
requireText(runner,"visibleObjects:String(selected.length)",'named board objects');
rejectText(runner,"import('./entry-v126.js",'legacy entry journey removed');

rejectText(html,'type="password"','password gate');
rejectText(html,'./app.js','client bootstrap isolation');
rejectText(sceneHtml,'./app.js','client bootstrap isolation');
console.log('Developer D1 all review notes, shared notes, naming, scenes, and elements verification passed');
