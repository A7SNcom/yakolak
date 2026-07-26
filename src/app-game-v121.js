console.info('[Yakolak] APP GAME v121 ENTRY JOURNEY WRAPPER LOADED');

const response = await fetch('./src/app-game-v114.js?v=121-entry-journey-wrapper', { cache: 'no-store' });
if (!response.ok) throw new Error(`v121 wrapper load failed: ${response.status}`);
let wrapper = await response.text();
const onlineClientUrl = new URL('./online-client-v114.js?v=121-entry-journey-client-runtime-fix', import.meta.url).href;

function replaceExact(oldValue, newValue, label) {
  const count = wrapper.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  wrapper = wrapper.replace(oldValue, newValue);
}

const entryRuntime = `
function injectV121EntryCss(){
  if(document.getElementById('yakolakEntryCss'))return;
  const link=document.createElement('link');
  link.id='yakolakEntryCss';link.rel='stylesheet';link.href='./styles/v121-entry.css?v=121';
  document.head.append(link);
}
function v121Node(tag,className='',text=''){
  const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
}
function v121GlobeIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8.2 4.2c-1.2 2.1-1.8 4.7-1.8 7.8s.6 5.7 1.8 7.8"></path><path d="M15.8 4.2c1.2 2.1 1.8 4.7 1.8 7.8s-.6 5.7-1.8 7.8"></path><path d="M4 9h16"></path><path d="M4 15h16"></path></svg>'}
function v121SettingsIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"></path><path d="M19.2 13.5v-3l-2.1-.7a7 7 0 0 0-.7-1.6l1-2-2.1-2.1-2 .9a7 7 0 0 0-1.6-.7L11 2.2H8l-.7 2.1a7 7 0 0 0-1.6.7l-2-.9-2.1 2.1 1 2a7 7 0 0 0-.7 1.6l-2.1.7v3l2.1.7c.2.6.4 1.1.7 1.6l-1 2 2.1 2.1 2-.9c.5.3 1 .5 1.6.7l.7 2.1h3l.7-2.1c.6-.2 1.1-.4 1.6-.7l2 .9 2.1-2.1-1-2c.3-.5.5-1 .7-1.6l2.1-.7Z" transform="translate(1.5 0)"></path></svg>'}
function v121EntryOverviewPose(){
  const portrait=innerHeight>innerWidth*1.18;
  const compactLandscape=!portrait&&(innerWidth<=900||innerHeight<=600);
  if(portrait)return{pos:{x:330,y:560,z:455},target:{x:0,y:18,z:0},fov:46};
  if(compactLandscape)return{pos:{x:245,y:325,z:285},target:{x:0,y:0,z:0},fov:45};
  return{pos:{x:520,y:430,z:520},target:{x:0,y:0,z:0},fov:43};
}
function v121SetWallCamera(){
  controls.enabled=false;
  camera.fov=innerWidth<=900?45:42;
  camera.position.set(0,245,-1120);
  controls.target.set(0,245,-2385);
  camera.updateProjectionMatrix();controls.update();render();
}
function v121CreateFloatingSettings(){
  if(document.getElementById('yakolakFloatingSettings'))return;
  const button=v121Node('button');button.id='yakolakFloatingSettings';button.type='button';button.setAttribute('aria-label','الإعدادات');button.innerHTML=v121SettingsIcon();
  const panel=v121Node('div');panel.id='yakolakEntrySettings';
  const home=v121Node('button','','العودة إلى الصفحة الرئيسية');home.type='button';home.onclick=()=>{const url=new URL(location.href);url.search='';location.href=url.toString()};
  const language=v121Node('button','','اللغة: العربية');language.type='button';language.onclick=()=>{};
  panel.append(home,language,v121Node('small','','English سيتم تطويرها لاحقًا'));
  button.onclick=e=>{e.stopPropagation();panel.classList.toggle('open')};
  document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&e.target!==button)panel.classList.remove('open')});
  document.body.append(button,panel);
}
function v121ShowHowTo(onDone){
  let modal=document.getElementById('yakolakHowTo');
  if(!modal){
    modal=v121Node('div');modal.id='yakolakHowTo';
    const card=v121Node('div','yh-card');
    card.append(v121Node('h2','','كيف تفوز في ياكلك؟'),v121Node('p','','ثلاث طرق سهلة؛ أول لاعب يكمل واحدة منها يفوز.'));
    [['١','ثلاث قطع من الحجم نفسه على خط واحد.'],['٢','صغير ووسط وكبير على خط واحد.'],['٣','صغير ووسط وكبير داخل الخانة نفسها.']].forEach(([n,text])=>{const row=v121Node('div','yh-rule');row.append(v121Node('b','',n),v121Node('span','',text));card.append(row)});
    const start=v121Node('button','yh-start','ابدأ التدريب');start.type='button';card.append(start);modal.append(card);document.body.append(modal);
  }
  try{localStorage.removeItem('yakolak-tutorial-v112-complete')}catch(e){}
  modal.classList.add('open');
  const start=modal.querySelector('.yh-start');
  start.onclick=()=>{modal.classList.remove('open');onDone?.()};
}
async function v121OpenOnline(){
  for(let i=0;i<80;i++){
    const entry=document.getElementById('yakolakOnlineEntry');
    if(entry){entry.click();return}
    await new Promise(resolve=>setTimeout(resolve,75));
  }
  caption('تعذر فتح الأونلاين الآن. أعد المحاولة من الإعدادات.');
}
function v121PrepareComputer(){
  gameState.configured=false;gameState.started=false;gameState.locked=false;gameState.humanColor=null;gameState.players=[];gameState.setupStep='color';
  document.body.classList.remove('yakolak-online-native-setup','yakolak-online-waiting');
  document.getElementById('yakolakGameSetup')?.classList.remove('hidden');
  renderSetupStep();renderSetup3D();
}
function initV121EntryFlow(){
  injectV121EntryCss();v121CreateFloatingSettings();
  const entry=v121Node('section');entry.id='yakolakEntry';entry.setAttribute('aria-label','اختيار طريقة اللعب');
  const panel=v121Node('div','ye-wall-panel');
  const top=v121Node('div','ye-top');
  const brand=v121Node('div','ye-brand');brand.append(v121Node('div','ye-kicker','YAKOLAK'),v121Node('div','ye-title','ياكلك'),v121Node('div','ye-sub','اختر كيف تحب تبدأ اللعبة'));
  const langWrap=v121Node('div','ye-language-wrap');
  const lang=v121Node('button','ye-language');lang.type='button';lang.setAttribute('aria-label','اختيار اللغة');lang.innerHTML=v121GlobeIcon();
  const langMenu=v121Node('div','ye-language-menu');
  const ar=v121Node('button','active','العربية');ar.type='button';
  const en=v121Node('button','','English · لاحقًا');en.type='button';en.disabled=true;
  langMenu.append(ar,en);lang.onclick=e=>{e.stopPropagation();langMenu.classList.toggle('open')};langWrap.append(lang,langMenu);top.append(brand,langWrap);panel.append(top);
  const actions=v121Node('div','ye-actions');
  const choices=[
    ['online','◉','ألعب أونلاين','أنشئ غرفة أو ادخل برمز صديقك'],
    ['computer','▣','مع الكمبيوتر','ابدأ مباراة سريعة ضد الكمبيوتر'],
    ['learn','؟','اشرحلي اللعبة','تعلم طرق الفوز ثم جرّب بنفسك']
  ];
  let choosing=false;
  const choose=async mode=>{
    if(choosing)return;choosing=true;langMenu.classList.remove('open');entry.classList.add('leaving');
    const pose=v121EntryOverviewPose();camera.fov=pose.fov;camera.updateProjectionMatrix();
    await setCameraView(pose.pos,pose.target,1120);
    setResponsiveOverview();controls.enabled=true;
    entry.hidden=true;document.body.classList.remove('yakolak-entry-open');document.body.classList.add('yakolak-entry-complete');
    if(mode==='online'){void v121OpenOnline();return}
    if(mode==='learn'){v121ShowHowTo(v121PrepareComputer);return}
    v121PrepareComputer();
  };
  choices.forEach(([mode,icon,title,note])=>{const button=v121Node('button','ye-choice');button.type='button';button.dataset.mode=mode;const iconNode=v121Node('span','ye-choice-icon',icon);const copy=v121Node('span');copy.append(v121Node('strong','',title),v121Node('small','',note));button.append(iconNode,copy,v121Node('span','ye-arrow','‹'));button.onclick=()=>choose(mode);actions.append(button)});
  panel.append(actions,v121Node('div','ye-foot','العربية هي النسخة المتاحة حاليًا'));entry.append(panel);document.body.append(entry);
  document.addEventListener('pointerdown',e=>{if(!langWrap.contains(e.target))langMenu.classList.remove('open')});
  document.body.classList.add('yakolak-entry-open');
  v121SetWallCamera();
  globalThis.__yakolakV121Entry={choose,show:()=>location.reload()};
}
async function startApp(){
  setLoadingProgress(8,'تجهيز الواجهة');
  injectCalibrationCss();
  injectV121EntryCss();
  ensureGameChrome();
  attachGameDebug();
  applyCalibration();
  setLoadingProgress(18,'تجهيز الإضاءة والخامات');
  await boot();
  initV121EntryFlow();
}
startApp().catch(fail);`;

const entryPatch = [
  'replaceRegex(',
  '  /async function startApp\\(\\)\\{.*?\\n\\}\\nstartApp\\(\\)\\.catch\\(fail\\);/s,',
  `  ${JSON.stringify(entryRuntime)},`,
  "  'install the v121 wall entry journey'",
  ');'
].join('\n');

replaceExact(
  "const response = await fetch('./src/app-game-v112.js?v=120-mobile-board-separation-wrapper', { cache: 'no-store' });",
  "const response = await fetch('./src/app-game-v112.js?v=121-entry-journey-source', { cache: 'no-store' });",
  'v121 source marker'
);
replaceExact(
  'replaceExact("const BUILD=\'112\';", "const BUILD=\'120\';", \'v120 build number\');',
  'replaceExact("const BUILD=\'112\';", "const BUILD=\'121\';", \'v121 build number\');',
  'v121 runtime build'
);
replaceExact(
  "  ');'\n].join('\\n');",
  `  ');',\n  ${JSON.stringify(entryPatch)}\n].join('\\n');`,
  'append v121 entry patch'
);
replaceExact(
  'yakolak-v120-mobile-board-separation-runtime.js',
  'yakolak-v121-entry-journey-runtime.js',
  'v121 source url'
);
replaceExact(
  "globalThis.__yakolakV117={build:117,base:116,change:'reuse-native-setup-tray-and-table-online'};globalThis.__yakolakV120={build:120,base:119,change:'mobile-only-board-separation'};",
  "globalThis.__yakolakV117={build:117,base:116,change:'reuse-native-setup-tray-and-table-online'};globalThis.__yakolakV120={build:120,base:119,change:'mobile-only-board-separation'};globalThis.__yakolakV121={build:121,base:120,change:'wall-entry-journey'};",
  'v121 runtime marker'
);
replaceExact(
  "await import('./online-client-v114.js?v=120-mobile-board-separation-client');",
  `await import(${JSON.stringify(onlineClientUrl)});`,
  'v121 online client absolute url'
);

const moduleUrl = URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  setTimeout(() => URL.revokeObjectURL(moduleUrl), 15000);
}
