const STORAGE_KEY='yakolak:v094:onboarding';
const SPEED_KEY='yakolak:v094:tutorial-speed';

const lessons=[
  {id:'welcome',title:'أهلًا بك في ياكلك',body:'هذه رحلة قصيرة داخل اللعبة نفسها. ستتعلّم بالحركة، لا بالحفظ. يمكنك تخطي أي خطوة أو بدء اللعب فورًا.',action:'ابدأ التدريب'},
  {id:'goal',title:'فكرة اللعبة في جملة',body:'اكسب قبل خصمك: كوّن خطًا من 3 أحجار متشابهة، أو خطًا متدرجًا صغير–متوسط–كبير، أو اجمع الأحجام الثلاثة في خانة واحدة.',action:'أرني كيف'},
  {id:'choose-color',title:'اختر لونك',body:'لا يوجد لون أقوى. اختر اللون الذي يعجبك، وسنستخدمه في بقية التدريب.',hint:'اضغط أي لون داخل الطاولة.',wait:'setup-color'},
  {id:'choose-rivals',title:'ابدأ بمنافس واحد',body:'منافس واحد يجعل أول مباراة أسهل للفهم. يمكنك لاحقًا زيادة عدد المنافسين.',hint:'اختر لاعبًا آليًا واحدًا.',wait:'setup-bots'},
  {id:'open-stack',title:'افتح طقم حجارتك',body:'اضغط حجرًا ظاهرًا من لونك. سيظهر لك الكبير والمتوسط والصغير.',hint:'اضغط أي حجر من لونك.',wait:'tray-open'},
  {id:'choose-size',title:'جرّب اختيار حجم',body:'اختر حجمًا بنفسك. الكبير مباشر، المتوسط مرن، والصغير ممتاز للمفاجآت والخط المتدرج.',hint:'اضغط حجرًا من الأحجام الظاهرة.',wait:'piece-selected'},
  {id:'place-piece',title:'ضع أول حجر',body:'اضغط خانة فارغة. يمكنك وضع أحجام مختلفة داخل الخانة نفسها، لكن لا يمكنك تكرار الحجم نفسه فيها.',hint:'اضغط إحدى الخانات المضيئة.',wait:'human-move'},
  {id:'bot-reply',title:'اقرأ رد الخصم',body:'الخصم لعب الآن. راقب: أي حجم اختار؟ وأي خط بدأ يبنيه؟ هذه أول عادة ذكية في ياكلك.',action:'فهمت',wait:'bot-move'},
  {id:'sizes',title:'الأحجام ليست قوة فقط',body:'الكبير يضغط مبكرًا، المتوسط يفتح خيارات، والصغير قد يكمل خطًا متدرجًا أو يختبئ داخل خطة لا يلاحظها الخصم.',action:'التالي'},
  {id:'wins',title:'طرق الفوز الثلاث',body:'1) خط من نفس الحجم. 2) خط متدرج صغير–متوسط–كبير. 3) الأحجام الثلاثة داخل خانة واحدة. سنريك التحقق منها دون تغيير مباراتك.',action:'اعرض طرق الفوز'},
  {id:'defense',title:'تمرين الدفاع',body:'تخيّل أن خصمك يملك حجرين في خط. حركتك الأفضل ليست دائمًا التي تبني خطك؛ أحيانًا الأفضل أن تغلق الخانة الثالثة.',hint:'قبل كل حركة ابحث عن خط خصم ناقص حجرًا واحدًا.',action:'فهمت الدفاع'},
  {id:'mistakes',title:'أخطاء أول مباراة',body:'لا تكرر الحجم نفسه في الخانة، لا تلعب قبل أن تتأكد من دورك، ولا تراقب حجارتك فقط؛ راقب خطوط الخصم أيضًا.',action:'التالي'},
  {id:'smart-hints',title:'المساعدة الذكية',body:'زر المساعدة لا يلعب بدلًا عنك. يعطيك سؤالًا مناسبًا للحالة: هل لديك فوز؟ هل خصمك على وشك الفوز؟ هل توجد خانة تفتح خطين؟',action:'جرّب المساعدة'},
  {id:'complete',title:'أنت جاهز للمباراة',body:'الآن العب بطريقتك. يمكنك إعادة الرحلة من زر «إعادة التعليم»، أو إغلاقها والعودة لها لاحقًا.',action:'ابدأ اللعب'}
];

function readProgress(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}}
function saveProgress(value){localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}
function game(){return globalThis.__yakolakGame||null}
function state(){return game()?.state||{}}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function boardCount(color){return Object.values(state().board||{}).reduce((n,c)=>n+Object.values(c||{}).filter(v=>v===color).length,0)}
function currentPlayer(){const s=state(),players=s.players||[];return players[s.turnIndex%Math.max(1,players.length)]||null}

function injectStyles(){
  if(document.getElementById('yakolakOnboardingStyles'))return;
  const style=document.createElement('style');style.id='yakolakOnboardingStyles';style.textContent=`
  #yo-root{position:fixed;inset:0;z-index:15000;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;direction:rtl}
  #yo-card{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:min(460px,calc(100vw - 32px));padding:18px;border:1px solid rgba(255,255,255,.18);border-radius:22px;background:rgba(7,11,18,.94);backdrop-filter:blur(18px);box-shadow:0 24px 80px rgba(0,0,0,.5);color:#fff;pointer-events:auto;transform:translateY(18px);opacity:0;transition:.24s ease}
  #yo-card.open{transform:none;opacity:1}.yo-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.yo-step{font-size:12px;color:#a7f3d0;font-weight:950}.yo-title{font-size:22px;font-weight:950;margin:10px 0 8px}.yo-body{font-size:15px;line-height:1.8;color:#e5e7eb}.yo-hint,.yo-feedback{margin-top:10px;padding:10px 12px;border-radius:12px;font-weight:800;font-size:13px}.yo-hint{background:rgba(45,212,191,.1);color:#99f6e4}.yo-feedback{background:rgba(246,208,105,.1);color:#fde68a}.yo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.yo-actions button{border:0;border-radius:12px;padding:11px 14px;font-weight:900;cursor:pointer}.yo-primary{background:#f6d069;color:#141414}.yo-secondary{background:#202938;color:#fff}.yo-ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,.15)!important}.yo-progress{height:4px;border-radius:9px;background:#253041;overflow:hidden;margin-top:14px}.yo-progress span{display:block;height:100%;background:linear-gradient(90deg,#2dd4bf,#f6d069);transition:width .25s}.yo-help{position:absolute;left:16px;top:16px;pointer-events:auto;display:flex;gap:8px}.yo-help button{border:1px solid rgba(255,255,255,.18);background:rgba(7,11,18,.78);color:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.yo-marker{position:absolute;width:42px;height:42px;border:3px solid #f6d069;border-radius:50%;box-shadow:0 0 0 10px rgba(246,208,105,.15);transform:translate(-50%,-50%);animation:yo-pulse 1.2s infinite;display:none}@keyframes yo-pulse{50%{box-shadow:0 0 0 22px rgba(246,208,105,0)}}
  @media(max-width:600px){#yo-card{right:12px;bottom:12px;width:calc(100vw - 24px);padding:15px;border-radius:17px}.yo-title{font-size:19px}.yo-body{font-size:14px;line-height:1.7}.yo-actions button{flex:1;min-width:105px}.yo-help{left:10px;top:max(10px,env(safe-area-inset-top))}.yo-help button{padding:8px 10px;font-size:12px}}
  @media(prefers-reduced-motion:reduce){#yo-card,.yo-progress span{transition:none}.yo-marker{animation:none}}
  `;document.head.appendChild(style);
}

function createUI(){
  injectStyles();
  const root=document.createElement('div');root.id='yo-root';root.innerHTML=`<div class="yo-help"><button id="yo-help">مساعدة</button><button id="yo-replay">إعادة التعليم</button></div><div id="yo-marker" class="yo-marker"></div><section id="yo-card" role="dialog" aria-live="polite"><div class="yo-top"><span id="yo-step" class="yo-step"></span><button id="yo-close" class="yo-ghost">إغلاق</button></div><h2 id="yo-title" class="yo-title"></h2><div id="yo-body" class="yo-body"></div><div id="yo-hint" class="yo-hint"></div><div id="yo-feedback" class="yo-feedback" hidden></div><div class="yo-actions"><button id="yo-next" class="yo-primary">التالي</button><button id="yo-skip-step" class="yo-ghost">تخطي الخطوة</button><button id="yo-skip" class="yo-secondary">ابدأ اللعب الآن</button><button id="yo-speed" class="yo-ghost">السرعة ×1</button></div><div class="yo-progress"><span id="yo-progress"></span></div></section>`;
  document.body.appendChild(root);return root;
}

function setupPoint(type,value){
  const g=game();if(!g?.setupGroup)return null;const rect=g.renderer.domElement.getBoundingClientRect();let point=null;
  g.setupGroup.traverse(o=>{const a=o?.userData?.setupAction;if(point||!a||a.type!==type||String(a.value)!==String(value))return;const p=new g.THREE.Vector3();o.getWorldPosition(p);p.project(g.camera);point={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}});return point;
}
function visibleHumanPiecePoint(){const g=game();if(!g?.pieces)return null;const p=g.pieces.find(x=>x.dir===g.state.humanColor&&!x.placed&&x.mesh.visible);if(!p)return null;const r=g.renderer.domElement.getBoundingClientRect(),v=new g.THREE.Vector3();p.mesh.getWorldPosition(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}}
function firstZonePoint(){const g=game();if(!g?.boardZones)return null;const z=g.boardZones.find(z=>!Object.values(g.state.board?.[z.id]||{}).some(Boolean));if(!z)return null;const r=g.renderer.domElement.getBoundingClientRect(),v=new g.THREE.Vector3(z.px,z.py+1,z.pz);g.gameGroup.localToWorld(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}}

function smartHint(){
  const g=game(),s=state();if(!g||!s.configured)return 'ابدأ باختيار لونك وعدد المنافسين.';
  if(s.tutorial)return 'أكمل نافذة التعليم الحالية أولًا.';
  if(!s.started)return 'انتظر بدء الجولة.';
  if(currentPlayer()?.color!==s.humanColor)return 'الآن دور الخصم. راقب خطته قبل حركتك التالية.';
  const own=boardCount(s.humanColor);const rival=Object.values(s.board||{}).reduce((n,c)=>n+Object.values(c||{}).filter(v=>v&&v!==s.humanColor).length,0);
  if(!own)return 'ابدأ بحجر يفتح لك أكثر من خط، مثل الخانة الوسطى أو إحدى الزوايا.';
  if(rival>=2)return 'افحص خطوط الخصم أولًا؛ قد تحتاج إلى منعه قبل بناء خطك.';
  if(game()?.pieces?.some(p=>p.mesh?.userData?.traySelected))return 'الحجم محدد الآن. اختر خانة مضيئة لا تحتوي الحجم نفسه.';
  return 'افتح طقمًا، ثم اسأل: هل هذه الحركة تبني خطًا أم تمنع خطًا؟';
}

export function startOnboardingV094(){
  if(document.getElementById('yo-root'))return;
  const root=createUI(),card=root.querySelector('#yo-card'),marker=root.querySelector('#yo-marker'),feedback=root.querySelector('#yo-feedback');let index=0,active=false,advancing=false;
  const speedValues=[1,2,4];let speedIndex=Math.max(0,speedValues.indexOf(Number(localStorage.getItem(SPEED_KEY)||1)));
  const baseline={human:0,bot:0};
  function markerAt(point){if(!point){marker.style.display='none';return}marker.style.display='block';marker.style.left=`${point.x}px`;marker.style.top=`${point.y}px`}
  function currentMarker(){const id=lessons[index]?.id;if(id==='choose-color')return setupPoint('color','right');if(id==='choose-rivals')return setupPoint('bots',1);if(id==='open-stack'||id==='choose-size')return visibleHumanPiecePoint();if(id==='place-piece')return firstZonePoint();return null}
  function showFeedback(text){feedback.textContent=text||'';feedback.hidden=!text}
  function render(){const lesson=lessons[index];if(!lesson)return;root.querySelector('#yo-step').textContent=`الخطوة ${index+1} من ${lessons.length}`;root.querySelector('#yo-title').textContent=lesson.title;root.querySelector('#yo-body').textContent=lesson.body;const hint=root.querySelector('#yo-hint');hint.textContent=lesson.hint||'';hint.hidden=!lesson.hint;root.querySelector('#yo-next').textContent=lesson.action||'التالي';root.querySelector('#yo-progress').style.width=`${((index+1)/lessons.length)*100}%`;root.querySelector('#yo-speed').textContent=`السرعة ×${speedValues[speedIndex]}`;root.querySelector('#yo-next').hidden=Boolean(lesson.wait);markerAt(currentMarker());showFeedback('');card.classList.add('open')}
  function finish(skipped=false){active=false;card.classList.remove('open');markerAt(null);saveProgress({completed:!skipped,skipped,completedAt:Date.now(),version:94,lastStep:index})}
  async function advance(reason='manual'){if(advancing)return;advancing=true;try{if(index>=lessons.length-1){finish(false);return}index++;saveProgress({version:94,lastStep:index,completed:false,skipped:false,updatedAt:Date.now(),reason});render();await sleep(100/speedValues[speedIndex])}finally{advancing=false}}
  function conditionMet(wait){const g=game(),s=state();if(wait==='setup-color')return s.setupStep==='bots';if(wait==='setup-bots')return s.configured;if(wait==='tray-open')return g?.pieces?.some(p=>p.mesh?.userData?.inTray||p.mesh?.userData?.traySelected);if(wait==='piece-selected')return g?.pieces?.some(p=>p.mesh?.userData?.traySelected);if(wait==='human-move')return boardCount(s.humanColor)>baseline.human;if(wait==='bot-move')return Object.values(s.board||{}).reduce((n,c)=>n+Object.values(c||{}).filter(v=>v&&v!==s.humanColor).length,0)>baseline.bot;return false}
  async function watch(){while(active){const lesson=lessons[index],s=state();if(lesson?.wait&&conditionMet(lesson.wait)){if(lesson.wait==='setup-bots'){baseline.human=boardCount(s.humanColor);baseline.bot=Object.values(s.board||{}).reduce((n,c)=>n+Object.values(c||{}).filter(v=>v&&v!==s.humanColor).length,0)}showFeedback('ممتاز! أكملت الخطوة.');await sleep(420/speedValues[speedIndex]);await advance('completed-action')}markerAt(currentMarker());await sleep(180)}}
  function begin(force=false){const p=readProgress();if(!force&&(p.completed||p.skipped))return;index=force?0:Math.min(Number(p.lastStep||0),lessons.length-1);active=true;render();watch()}
  root.querySelector('#yo-next').onclick=()=>advance('button');root.querySelector('#yo-skip-step').onclick=()=>advance('skip-step');root.querySelector('#yo-skip').onclick=()=>finish(true);root.querySelector('#yo-close').onclick=()=>card.classList.remove('open');root.querySelector('#yo-help').onclick=()=>{active=true;card.classList.add('open');showFeedback(smartHint())};root.querySelector('#yo-replay').onclick=()=>begin(true);root.querySelector('#yo-speed').onclick=()=>{speedIndex=(speedIndex+1)%speedValues.length;localStorage.setItem(SPEED_KEY,String(speedValues[speedIndex]));render()};
  globalThis.__yakolakOnboarding={start:()=>begin(true),skip:()=>finish(true),next:()=>advance('api'),lessons,get progress(){return readProgress()},get current(){return lessons[index]},hint:smartHint};
  begin(false);
}

function boot(){const wait=setInterval(()=>{if(globalThis.__yakolakGame?.renderer){clearInterval(wait);startOnboardingV094()}},120)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
