import {resolvePreviewRequest} from './developer-d4-registry.js?v=D4-preview-contract';

const request=resolvePreviewRequest(location.search,document.baseURI);
if(!request||request.previewMode!=='state')throw new Error(`Invalid D4 state preview: ${location.search}`);
const {definition,variant,params}=request;
const entityKind=definition.kind;
const entityId=definition.id;
const sceneId=entityKind==='scene'?entityId:'';
const elementId=entityKind==='element'?entityId:'';
const variantId=variant.id;
const preview=params.get('preview')==='1';
const loader=document.getElementById('sceneLoading')||document.getElementById('yakolakLoader');
const status=document.getElementById('sceneStatus');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rad=value=>value*Math.PI/180;
const COLORS=['right','back','left','front'];
const COLOR_LABEL={right:'الأبيض',back:'الأزرق',left:'الذهبي',front:'الأخضر'};
let replayTimer=0;

Object.assign(document.body.dataset,{preview:preview?'1':'0',developerEntityKind:entityKind,developerEntity:entityId,developerVariant:variantId});
if(sceneId)document.body.dataset.developerScene=sceneId;
if(elementId)document.body.dataset.developerElement=elementId;
if(status)status.textContent=`D4 · ${entityId} · ${variantId}`;

function removeLoader(){if(loader?.parentNode)loader.parentNode.removeChild(loader)}
function showDom(id){const node=document.getElementById(id);if(!node)return null;node.hidden=false;node.style.removeProperty('display');node.setAttribute('aria-hidden','false');return node}
function hideDom(id){const node=document.getElementById(id);if(!node)return;node.hidden=true;node.style.display='none';node.setAttribute('aria-hidden','true')}
function overlay(title,copy,actions=[]){
  document.getElementById('d4StateOverlay')?.remove();
  const node=document.createElement('section');node.id='d4StateOverlay';node.innerHTML=`<span>${entityKind==='scene'?'حالة من رحلة اللعبة':'عنصر واجهة'}</span><h1>${title}</h1><p>${copy}</p><div>${actions.map(text=>`<button type="button">${text}</button>`).join('')}</div>`;
  const style=document.createElement('style');style.textContent='#d4StateOverlay{position:fixed;z-index:120;inset:auto 50% 34px auto;transform:translateX(50%);width:min(560px,calc(100vw - 28px));padding:18px;border:1px solid #d7d5ce;border-radius:20px;background:#fffffff2;box-shadow:0 18px 55px #0002;backdrop-filter:blur(14px);text-align:right;font-family:system-ui;color:#20201e}#d4StateOverlay>span{font-size:10px;font-weight:900;color:#777}#d4StateOverlay h1{margin:5px 0 7px;font-size:22px}#d4StateOverlay p{margin:0;color:#676660;line-height:1.7;font-size:13px}#d4StateOverlay>div{display:flex;gap:8px;margin-top:14px}#d4StateOverlay button{min-height:44px;border:1px solid #ddd;border-radius:11px;background:#fff;padding:0 14px;font-weight:850}#d4StateOverlay button:first-child{background:#222;color:#fff;border-color:#222}@media(max-width:600px){#d4StateOverlay{bottom:16px}#d4StateOverlay h1{font-size:18px}}';
  document.head.append(style);document.body.append(node);return node;
}
function markReady(details={}){Object.assign(document.body.dataset,{sceneReady:'true',...details});globalThis.__yakolakDeveloperD4State={build:'D4',entityKind,entityId,variant:variantId,...details};parent.postMessage({type:'yakolak-developer-scene-ready',entityKind,entityId,scene:sceneId,element:elementId,variant:variantId,build:'D4',details},'*')}
async function waitForGame(){for(let index=0;index<800;index++){const game=globalThis.__yakolakGame;if(game?.renderer&&game?.camera&&game?.controls&&game?.pieces?.length&&game?.debugTriggerWin)return game;await wait(25)}throw new Error(`D4 state failed to load ${entityKind} ${entityId}`)}
function render(game){game.render?.()}
function resetPiece(piece){piece.placed=false;piece.zoneIndex=null;piece.slotSize=null;piece.mesh.userData.inTray=false;piece.mesh.userData.traySelected=false;piece.mesh.scale.setScalar(1);piece.mesh.position.set(piece.final.px,piece.final.py,piece.final.pz);piece.mesh.rotation.set(rad(piece.final.rx),rad(piece.final.ry),rad(piece.final.rz))}
function playersFor(count=4){return count===2?['front','back']:['front','back','left','right']}
function setupPlay(game,{count=4,color='front',showHud=true}={}){
  const players=playersFor(count);Object.assign(game.state,{humanColor:color,players,configured:true,started:true,locked:false,winner:null,tutorial:false,firstMoveGuide:false,currentIndex:Math.max(0,players.indexOf(color)),round:game.state.round||1});
  if(game.emptyBoard)game.state.board=game.emptyBoard();
  game.setupGroup.visible=false;game.gameGroup.visible=true;if(game.meshes?.['9'])game.meshes['9'].visible=true;
  COLORS.forEach(key=>{const base=game.meshes?.[`3-${key}`];if(base)base.visible=players.includes(key)});
  game.pieces.forEach(piece=>{resetPiece(piece);piece.mesh.visible=players.includes(piece.dir)});
  for(const id of ['yakolakGameSetup','yakolakOnlineDialog','yakolakOnlineEntry','yakolakHowTo','yakolakEntry','yakolakTutorialDialog'])hideDom(id);
  if(showHud){showDom('yakolakGameHud');showDom('yakolakGameScore')}else{hideDom('yakolakGameHud');hideDom('yakolakGameScore')}
  game.syncActiveReadinessBases?.();game.setResponsiveOverview?.();game.syncScoreHud?.();game.updateTurnGlow?.();game.syncZoneMarkers?.(false);render(game);
}
function selectVisualPiece(game,size='l',color='front'){const piece=game.pieces.find(item=>item.type===size&&item.dir===color&&!item.placed);if(!piece)return null;piece.mesh.position.y+=18;piece.mesh.scale.multiplyScalar(1.06);return piece}
function configureGameplay(game){const count=variantId==='two-players'?2:4;setupPlay(game,{count});game.caption?.(`بداية اللعب · ${count===2?'لاعبان':'أربعة لاعبين'}`);return{mode:'game-state',composition:'gameplay-ready',players:String(count)}}
function configureLegalMoves(game){setupPlay(game,{count:4});const size=variant.query.size||'l';const piece=selectVisualPiece(game,size,'front');game.syncZoneMarkers?.(true);game.caption?.(`اختر خانة متاحة للقطعة ${size==='l'?'الكبيرة':size==='m'?'المتوسطة':'الصغيرة'}.`);render(game);return{mode:'game-state',composition:'legal-moves',size,selected:String(Boolean(piece))}}
function configureTurn(game){const color=variant.query.color||variantId;setupPlay(game,{count:4,color});game.state.currentIndex=Math.max(0,game.state.players.indexOf(color));game.syncScoreHud?.();game.updateTurnGlow?.();game.caption?.(`الدور الآن: ${COLOR_LABEL[color]||color}`);game.startTurnTimer?.();render(game);return{mode:'game-state',composition:'turn-state',activeColor:color}}
function showTutorial(game,mode=variantId){setupPlay(game,{count:2});if(mode==='guided'){game.state.firstMoveGuide=true;game.syncZoneMarkers?.(true);selectVisualPiece(game,'l','front');game.caption?.('افتح طقمك، اختر أي حجم، ثم ضع القطعة في خانة متاحة.');overlay('تعلّم داخل أول حركة','المؤقت متوقف في أول دور فقط، وتبقى اللوحة قابلة للتجربة.',['فهمت']);render(game);return{mode:'tutorial',composition:'guided-first-turn'}}
  game.ensureTutorialDialog?.();const dialog=showDom('yakolakTutorialDialog');if(dialog){dialog.classList.add('open');const text=dialog.querySelector('.yt-text');if(text)text.textContent='تعلّم أثناء اللعب: اختر قطعة ثم ضعها في خانة متاحة.';const start=dialog.querySelector('.yt-ok');if(start)start.textContent='ابدأ اللعب';const skip=dialog.querySelector('.yt-repeat');if(skip)skip.textContent='تخطي التعليم'}else overlay('هل تبدأ التعليم؟','تعليم قصير يحدث داخل أول حركة حقيقية، ويمكن تخطيه.',['ابدأ اللعب','تخطي التعليم']);return{mode:'tutorial',composition:'tutorial-prompt',nativeDialog:String(Boolean(dialog))}}
function configureWinner(game,preset=variant.query.preset||variantId){setupPlay(game,{count:2});game.previewWinnerHighlightPreset?.(preset);if(!game.previewWinnerHighlightPreset)game.debugTriggerWin('same-size','front');render(game);return{mode:'win-state',composition:'winner-highlight',preset}}
function configureResult(game,type=variant.query.win||variantId){setupPlay(game,{count:2});const win=game.debugTriggerWin(type,'front');overlay('فاز الأخضر بالجولة',type==='graded'?'خط متدرج: صغير ثم متوسط ثم كبير.':type==='cell'?'اكتملت الأحجام الثلاثة في خانة واحدة.':'ثلاث قطع من الحجم نفسه في خط واحد.',['الجولة التالية']);render(game);return{mode:'result-state',composition:'round-result',winType:type,triggered:String(Boolean(win))}}
function onlineCard(mode){const copy=mode==='room-code'?'أدخل رمز الغرفة المكوّن من الحروف والأرقام للانضمام.':mode==='waiting'?'الغرفة جاهزة؛ ينتظر النظام اكتمال المشاركين واستعدادهم.':'أنشئ غرفة جديدة أو انضم إلى غرفة موجودة.';const actions=mode==='room-code'?['انضمام','رجوع']:mode==='waiting'?['نسخ الرمز','مغادرة']:['إنشاء غرفة','لدي رمز'];return overlay(mode==='waiting'?'غرفة الانتظار':mode==='room-code'?'الانضمام إلى غرفة':'اللعب أونلاين',copy,actions)}
function configureOnline(game,mode=variantId){setupPlay(game,{count:2,showHud:false});const native=showDom('yakolakOnlineEntry');if(native){native.classList.add('open');native.dataset.developerVariant=mode}else onlineCard(mode);return{mode:'online-state',composition:mode,nativeEntry:String(Boolean(native))}}
function configureZoneElement(game){setupPlay(game,{count:2,showHud:false});if(variantId==='occupied'){const piece=game.pieces.find(item=>item.dir==='front'&&item.type==='l');if(piece){piece.placed=true;piece.zoneIndex=4;piece.slotSize='l';game.state.board[4].l='front';const zone=game.boardZones[4];piece.mesh.position.set(zone.px,zone.py,zone.pz)}}game.syncZoneMarkers?.(true);game.camera.position.set(250,300,250);game.controls.target.set(0,0,0);game.controls.update();render(game);return{mode:'ui-element',composition:'zone-marker',state:variantId}}
function configureScoreElement(game){setupPlay(game,{count:2});const count={one:1,three:3,five:5}[variantId]||1;for(let index=0;index<count;index++)game.debugScorePoint?.('front');game.caption?.(`${count} ${count===1?'نقطة':'نقاط'} للأخضر`);render(game);return{mode:'ui-element',composition:'score-marker',count:String(count)}}
function configureHudElement(game){const count=variantId==='two-players'?2:4;setupPlay(game,{count});game.caption?.('دورك: اختر قطعة ثم خانة متاحة.');return{mode:'ui-element',composition:'game-hud',players:String(count)}}

const sceneHandlers={
  'gameplay-ready':configureGameplay,
  'legal-moves':configureLegalMoves,
  'turn-state':configureTurn,
  'tutorial-first-move':showTutorial,
  'winner-highlight':configureWinner,
  'round-result':configureResult,
  'online-entry':configureOnline
};
const elementHandlers={
  'zone-marker':configureZoneElement,
  'score-marker':configureScoreElement,
  'game-hud':configureHudElement,
  'tutorial-dialog':game=>showTutorial(game,'prompt'),
  'online-panel':configureOnline,
  'winner-glow':configureWinner
};

async function run(){
  if(loader){loader.id='yakolakLoader';loader.remove=()=>{loader.dataset.removePending='1'}}
  await import('./mobile-clarity-v120.js?v=D4-state-preview');
  await import('./app-game-developer-d4.js?v=D4-state-preview');
  const game=await waitForGame();
  const handler=(entityKind==='scene'?sceneHandlers:elementHandlers)[entityId];
  if(!handler)throw new Error(`Unknown D4 state ${entityKind}:${entityId}`);
  const details=handler(game);
  if(preview){game.controls.enabled=false;game.renderer.domElement.style.pointerEvents='none'}
  removeLoader();render(game);markReady(details);
  if(['winner-highlight','winner-glow'].includes(entityId))replayTimer=setInterval(()=>configureWinner(game),4200);
}
function gameCleanup(){try{globalThis.__yakolakGame?.clearTurnTimer?.()}catch{}}
addEventListener('pagehide',()=>{if(replayTimer)clearInterval(replayTimer);gameCleanup()});
run().catch(error=>{console.error('[Yakolak] D4 state preview failed',error);if(status)status.textContent='D4 · ERROR';document.body.dataset.sceneError=String(error?.message||error);parent.postMessage({type:'yakolak-developer-scene-error',entityKind,entityId,variant:variantId,error:String(error?.message||error)},'*')});
