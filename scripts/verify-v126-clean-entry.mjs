import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('app.js');
const entry=read('src/entry-v126.js');
const html=read('index.html');
const version=JSON.parse(read('version.json'));

const requireText=(source,text,label)=>{
  if(!source.includes(text))throw new Error(`${label}: missing ${text}`);
};
const rejectText=(source,text,label)=>{
  if(source.includes(text))throw new Error(`${label}: legacy dependency found: ${text}`);
};

requireText(app,"./src/app-game-v114.js?v=",'stable room import');
requireText(app,"./src/entry-v126.js?v=",'clean entry import');
requireText(app,"loader?.classList.add('error')",'visible bootstrap recovery');
requireText(app,"document.getElementById('yakolakRetry')",'bootstrap retry focus');
['app-game-v121','app-game-v122','app-game-v123','app-game-v124','app-game-v125'].forEach(value=>rejectText(app,value,'app bootstrap'));

requireText(html,'id="yakolakLoaderStar"','star-only loader');
requireText(html,'M0,-191.393L-20.116','approved loading star geometry');
requireText(html,'@keyframes bounce','approved loading star motion');
rejectText(html,'yakolakLoaderProgress','legacy progress bar');
requireText(html,"loaderEl.classList.add('handoff')",'transparent loader handoff');
requireText(html,'id="yakolakLoaderError"','visible loader error');
requireText(html,'id="yakolakRetry"','loader retry action');
requireText(html,'body class="yakolak-v126-entry"','entry-scoped native chrome hiding');
requireText(html,'body.yakolak-v126-entry #yakolakGameSetup','native setup hidden only during entry');

requireText(entry,"source:'v120-stable-room-table'",'stable source marker');
requireText(entry,'gameGroup.visible=false','empty table requirement');
requireText(entry,'gameGroup.visible=true','native game restored');
requireText(entry,"renderer.domElement.style.pointerEvents='auto'",'canvas interaction restored');
requireText(entry,"document.body.classList.remove('yakolak-v126-entry')",'native chrome restored');
requireText(entry,'game.renderSetup3D?.()','native setup reused');
requireText(entry,"reduced?'reduced-motion-skip'",'reduced motion skips full journey');
requireText(entry,'./assets/YAKOLAK.svg','official Yakolak logo');
requireText(entry,'./assets/MTKYF.svg','official MTKYF logo');
requireText(entry,'CubicBezierCurve3','single stable camera path');
requireText(entry,'slerpQuaternions','stable camera rotation');
requireText(entry,"phase:'complete'",'runtime completion marker');

if(version.build!==126)throw new Error(`version build mismatch: ${version.build}`);
console.log('v126 playable entry handoff verification passed');
