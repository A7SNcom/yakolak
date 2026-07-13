const STORAGE_KEY='yakolak:v094:onboarding';
const SPEED_KEY='yakolak:v094:tutorial-speed';

const lessons=[
  {id:'welcome',title:'مرحبًا بك في ياكلك',body:'هدفك أن تكون أول لاعب يحقق أحد أشكال الفوز. سنعلّمك أثناء اللعب، خطوة بخطوة، ويمكنك التخطي في أي وقت.',action:'ابدأ الرحلة'},
  {id:'choose-color',title:'اختر لونك',body:'اختر اللون الذي تريد اللعب به. لا يوجد لون أقوى من الآخر؛ الاختيار يغيّر فقط مكانك وترتيب الدور.',hint:'اضغط على أحد الألوان الظاهرة داخل الطاولة.'},
  {id:'choose-rivals',title:'اختر عدد المنافسين',body:'ابدأ بمنافس واحد لتتعلم بسهولة. لاحقًا يمكنك اللعب ضد أكثر من خصم.',hint:'اختر لاعبًا آليًا واحدًا.'},
  {id:'goal',title:'ثلاث طرق للفوز',body:'تفوز بإكمال خط من ثلاثة أحجار من نفس الحجم، أو خط متدرج صغير-متوسط-كبير، أو بوضع الأحجام الثلاثة داخل خانة واحدة.',action:'فهمت'},
  {id:'open-stack',title:'افتح طقم حجارتك',body:'كل طقم يحتوي حجرًا كبيرًا ومتوسطًا وصغيرًا. اضغط أي حجر ظاهر من لونك لفتح الأحجام.',hint:'اضغط أحد أحجار لونك.'},
  {id:'choose-size',title:'اختر الحجم',body:'الحجر الكبير واضح لكنه محدود، والمتوسط متوازن، والصغير ممتاز للمفاجآت والخطط المتدرجة.',hint:'اختر الحجم الذي تريد وضعه.'},
  {id:'place-piece',title:'ضع أول حجر',body:'اضغط خانة فارغة. يمكنك وضع حجم مختلف لاحقًا داخل الخانة نفسها، لكن لا يمكنك تكرار الحجم نفسه فيها.',hint:'اختر إحدى الدوائر المضيئة.'},
  {id:'bot-reply',title:'راقب رد الخصم',body:'بعد حركتك يلعب الخصم تلقائيًا. راقب اللون والحجم والمكان؛ كل حركة تكشف خطته.',action:'متابعة'},
  {id:'defense',title:'فكّر هجوميًا ودفاعيًا',body:'قبل كل حركة اسأل نفسك سؤالين: هل هذه الحركة تقرّبني من الفوز؟ وهل تمنع خصمي من إكمال خطه؟',action:'جرّب بنفسي'},
  {id:'complete',title:'أنت جاهز',body:'ابدأ المباراة الآن. استخدم زر المساعدة عند الحيرة، ويمكنك إعادة التعليم من القائمة في أي وقت.',action:'ابدأ اللعب'}
];

function readProgress(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}}
function saveProgress(value){localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}
function game(){return globalThis.__yakolakGame||null}
function state(){return game()?.state||{}}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

function injectStyles(){
  if(document.getElementById('yakolakOnboardingStyles'))return;
  const style=document.createElement('style');style.id='yakolakOnboardingStyles';style.textContent=`
  #yo-root{position:fixed;inset:0;z-index:15000;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;direction:rtl}
  #yo-card{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:min(430px,calc(100vw - 32px));padding:18px;border:1px solid rgba(255,255,255,.18);border-radius:20px;background:rgba(7,11,18,.94);backdrop-filter:blur(18px);box-shadow:0 24px 80px rgba(0,0,0,.48);color:#fff;pointer-events:auto;transform:translateY(18px);opacity:0;transition:.24s ease}
  #yo-card.open{transform:none;opacity:1}.yo-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.yo-step{font-size:12px;color:#a7f3d0;font-weight:900}.yo-title{font-size:22px;font-weight:950;margin:10px 0 8px}.yo-body{font-size:15px;line-height:1.8;color:#e5e7eb}.yo-hint{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(45,212,191,.1);color:#99f6e4;font-weight:800;font-size:13px}.yo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.yo-actions button{border:0;border-radius:12px;padding:11px 15px;font-weight:900;cursor:pointer}.yo-primary{background:#f6d069;color:#141414}.yo-secondary{background:#202938;color:#fff}.yo-ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,.15)!important}.yo-progress{height:4px;border-radius:9px;background:#253041;overflow:hidden;margin-top:14px}.yo-progress span{display:block;height:100%;background:linear-gradient(90deg,#2dd4bf,#f6d069);transition:width .25s}.yo-help{position:absolute;left:16px;top:16px;pointer-events:auto;display:flex;gap:8px}.yo-help button{border:1px solid rgba(255,255,255,.18);background:rgba(7,11,18,.78);color:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.yo-marker{position:absolute;width:42px;height:42px;border:3px solid #f6d069;border-radius:50%;box-shadow:0 0 0 10px rgba(246,208,105,.15);transform:translate(-50%,-50%);animation:yo-pulse 1.2s infinite;display:none}@keyframes yo-pulse{50%{box-shadow:0 0 0 22px rgba(246,208,105,0)}}
  @media(max-width:600px){#yo-card{right:12px;bottom:12px;width:calc(100vw - 24px);padding:15px;border-radius:17px}.yo-title{font-size:19px}.yo-body{font-size:14px;line-height:1.7}.yo-actions button{flex:1;min-width:110px}}
  @media(prefers-reduced-motion:reduce){#yo-card,.yo-progress span{transition:none}.yo-marker{animation:none}}
  `;document.head.appendChild(style);
}

function createUI(){
  injectStyles();
  const root=document.createElement('div');root.id='yo-root';root.innerHTML=`<div class="yo-help"><button id="yo-help">مساعدة</button><button id="yo-replay">إعادة التعليم</button></div><div id="yo-marker" class="yo-marker"></div><section id="yo-card" role="dialog" aria-live="polite"><div class="yo-top"><span id="yo-step" class="yo-step"></span><button id="yo-close" class="yo-ghost">إغلاق</button></div><h2 id="yo-title" class="yo-title"></h2><div id="yo-body" class="yo-body"></div><div id="yo-hint" class="yo-hint"></div><div class="yo-actions"><button id="yo-next" class="yo-primary">التالي</button><button id="yo-skip" class="yo-secondary">تخطي التعليم</button><button id="yo-speed" class="yo-ghost">السرعة ×1</button></div><div class="yo-progress"><span id="yo-progress"></span></div></section>`;
  document.body.appendChild(root);return root;
}

function setupPoint(type,value){
  const g=game();if(!g?.setupGroup)return null;const rect=g.renderer.domElement.getBoundingClientRect();let point=null;
  g.setupGroup.traverse(o=>{const a=o?.userData?.setupAction;if(point||!a||a.type!==type||String(a.value)!==String(value))return;const p=new g.THREE.Vector3();o.getWorldPosition(p);p.project(g.camera);point={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}});return point;
}
function visibleHumanPiecePoint(){const g=game();if(!g?.pieces)return null;const p=g.pieces.find(x=>x.dir===g.state.humanColor&&!x.placed&&x.mesh.visible);if(!p)return null;const r=g.renderer.domElement.getBoundingClientRect(),v=new g.THREE.Vector3();p.mesh.getWorldPosition(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}}
function firstZonePoint(){const g=game();if(!g?.boardZones)return null;const z=g.boardZones.find(z=>!Object.values(g.state.board?.[z.id]||{}).some(Boolean));if(!z)return null;const r=g.renderer.domElement.getBoundingClientRect(),v=new g.THREE.Vector3(z.px,z.py+1,z.pz);g.gameGroup.localToWorld(v);v.project(g.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}}

export function startOnboardingV094(){
  const root=createUI(),card=root.querySelector('#yo-card'),marker=root.querySelector('#yo-marker');let index=0,active=false;
  const speedValues=[1,2,4];let speedIndex=Math.max(0,speedValues.indexOf(Number(localStorage.getItem(SPEED_KEY)||1)));
  function markerAt(point){if(!point){marker.style.display='none';return}marker.style.display='block';marker.style.left=`${point.x}px`;marker.style.top=`${point.y}px`}
  function currentMarker(){const id=lessons[index]?.id;if(id==='choose-color')return setupPoint('color','right');if(id==='choose-rivals')return setupPoint('bots',1);if(id==='open-stack'||id==='choose-size')return visibleHumanPiecePoint();if(id==='place-piece')return firstZonePoint();return null}
  function render(){const lesson=lessons[index];if(!lesson)return;root.querySelector('#yo-step').textContent=`الخطوة ${index+1} من ${lessons.length}`;root.querySelector('#yo-title').textContent=lesson.title;root.querySelector('#yo-body').textContent=lesson.body;const hint=root.querySelector('#yo-hint');hint.textContent=lesson.hint||'';hint.hidden=!lesson.hint;root.querySelector('#yo-next').textContent=lesson.action||'التالي';root.querySelector('#yo-progress').style.width=`${((index+1)/lessons.length)*100}%`;root.querySelector('#yo-speed').textContent=`السرعة ×${speedValues[speedIndex]}`;markerAt(currentMarker());card.classList.add('open')}
  function finish(skipped=false){active=false;card.classList.remove('open');markerAt(null);saveProgress({completed:!skipped,skipped,completedAt:Date.now(),version:94})}
  async function advance(){if(index>=lessons.length-1){finish(false);return}index++;render();await sleep(120/speedValues[speedIndex])}
  async function watch(){while(active){const id=lessons[index]?.id,s=state();if(id==='choose-color'&&s.setupStep==='bots')await advance();else if(id==='choose-rivals'&&s.configured)await advance();else if(id==='open-stack'&&game()?.pieces?.some(p=>p.mesh?.userData?.inTray))await advance();else if(id==='choose-size'&&game()?.pieces?.some(p=>p.mesh?.userData?.traySelected))await advance();else if(id==='place-piece'&&Object.values(s.board||{}).some(c=>Object.values(c||{}).includes(s.humanColor)))await advance();else if(id==='bot-reply'&&Object.values(s.board||{}).some(c=>Object.values(c||{}).some(color=>color&&color!==s.humanColor)))await advance();markerAt(currentMarker());await sleep(220)}}
  function begin(force=false){const p=readProgress();if(!force&&(p.completed||p.skipped))return;index=0;active=true;render();watch()}
  root.querySelector('#yo-next').onclick=advance;root.querySelector('#yo-skip').onclick=()=>finish(true);root.querySelector('#yo-close').onclick=()=>card.classList.remove('open');root.querySelector('#yo-help').onclick=()=>{active=true;render()};root.querySelector('#yo-replay').onclick=()=>begin(true);root.querySelector('#yo-speed').onclick=()=>{speedIndex=(speedIndex+1)%speedValues.length;localStorage.setItem(SPEED_KEY,String(speedValues[speedIndex]));render()};
  globalThis.__yakolakOnboarding={start:()=>begin(true),skip:()=>finish(true),lessons,get progress(){return readProgress()}};
  begin(false);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{const wait=setInterval(()=>{if(globalThis.__yakolakGame){clearInterval(wait);startOnboardingV094()}},150)});else{const wait=setInterval(()=>{if(globalThis.__yakolakGame){clearInterval(wait);startOnboardingV094()}},150)}
