import {sceneDefinitions,elementDefinitions,developerDefinitions,definitionKey} from './developer-d1-registry.js?v=D1-shared';

console.info('[Yakolak] DEVELOPER D1 SHARED REVIEW GALLERY LOADED');

const tabs=[
  {id:'all',label:'كل المشاهد'},
  {id:'single',label:'مشهد واحد'},
  {id:'sequence',label:'مجموعة مشاهد'},
  {id:'elements',label:'العناصر'}
];
const LOCAL_KEY='yakolak:developer-d1:shared-review:v1';
const API_URL='./api/developer-d1';
const grid=document.getElementById('sceneGrid');
const tabsRoot=document.getElementById('sceneTabs');
const count=document.getElementById('sceneCount');
const stage=document.getElementById('devStage');
const stageFrame=document.getElementById('devStageFrame');
const stageTitle=document.getElementById('devStageTitle');
const back=document.getElementById('devBack');
const notesToggle=document.getElementById('devNotesToggle');
const editor=document.getElementById('devEditor');
const editorScrim=document.getElementById('devEditorScrim');
const editorClose=document.getElementById('devEditorClose');
const editorEntity=document.getElementById('devEditorEntity');
const nameInput=document.getElementById('devNameInput');
const codeKey=document.getElementById('devCodeKey');
const notesInput=document.getElementById('devNotesInput');
const saveButton=document.getElementById('devSave');
const editorStatus=document.getElementById('devEditorStatus');
let activeFilter='all';
let activeStageEntity=null;
let activeEditorEntity=null;
let saveTimer=0;
let dirty=false;
let remoteAvailable=false;
const stateByKey=new Map();

function localSnapshot(){
  try{
    const parsed=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}');
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return{}}
}

function loadLocal(){
  const local=localSnapshot();
  developerDefinitions.forEach(definition=>{
    const key=definitionKey(definition);
    const value=local[key];
    if(!value||typeof value!=='object')return;
    stateByKey.set(key,{
      displayName:String(value.displayName||''),
      notes:String(value.notes||''),
      updatedAt:String(value.updatedAt||''),
      pending:Boolean(value.pending),
      source:'local'
    });
  });
}

function persistLocal(){
  try{
    const out={};
    stateByKey.forEach((value,key)=>{out[key]=value});
    localStorage.setItem(LOCAL_KEY,JSON.stringify(out));
    return true;
  }catch{return false}
}

function stateFor(definition){
  return stateByKey.get(definitionKey(definition))||{displayName:'',notes:'',updatedAt:'',pending:false,source:'default'};
}

function displayName(definition){
  return stateFor(definition).displayName.trim()||definition.defaultName;
}

function setStatus(text,tone=''){
  editorStatus.textContent=text;
  editorStatus.className=`dev-editor-status${tone?` ${tone}`:''}`;
}

function entityUrl(definition,preview=false){
  const url=new URL('./developer-scene.html',location.href);
  if(definition.kind==='element')url.searchParams.set('element',definition.id);
  else url.searchParams.set('scene',definition.id);
  if(preview)url.searchParams.set('preview','1');
  url.searchParams.set('d','D1');
  return url.toString();
}

function cardFromMessage(event){
  return[...grid.querySelectorAll('.scene-card')].find(card=>card.querySelector('iframe')?.contentWindow===event.source)||null;
}

addEventListener('message',event=>{
  const data=event.data||{};
  if(!String(data.type||'').startsWith('yakolak-developer-scene-'))return;
  const card=cardFromMessage(event);
  if(!card)return;
  const state=card.querySelector('.scene-preview-state span');
  if(data.type==='yakolak-developer-scene-ready'){
    card.classList.remove('preview-error');
    card.classList.add('preview-ready');
    card.dataset.previewState='ready';
    if(state)state.textContent=card.dataset.entityKind==='element'?'العنصر جاهز':'المشهد جاهز';
  }else{
    card.classList.add('preview-error');
    card.dataset.previewState='error';
    if(state)state.textContent='تعذر تحميل المعاينة';
  }
});

const previewObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    const iframe=entry.target.querySelector('iframe[data-src]');
    if(iframe&&!iframe.src.includes('developer-scene.html')){
      iframe.src=iframe.dataset.src;
      delete iframe.dataset.src;
      entry.target.dataset.previewState='loading';
    }
    previewObserver.unobserve(entry.target);
  });
},{rootMargin:'180px 0px',threshold:.06});

function renderTabs(){
  tabsRoot.innerHTML='';
  tabs.forEach(tab=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='dev-tab'+(tab.id===activeFilter?' active':'');
    button.textContent=tab.label;
    button.dataset.filter=tab.id;
    button.setAttribute('aria-pressed',String(tab.id===activeFilter));
    button.onclick=()=>{
      activeFilter=tab.id;
      renderTabs();
      applyFilter();
    };
    tabsRoot.append(button);
  });
}

function updateCardState(card,definition){
  const entityState=stateFor(definition);
  const title=card.querySelector('.scene-title');
  const previewTitle=card.querySelector('.scene-preview-state strong');
  const indicator=card.querySelector('.scene-note-indicator');
  const hasNote=Boolean(entityState.notes.trim());
  if(title)title.textContent=displayName(definition);
  if(previewTitle)previewTitle.textContent=displayName(definition);
  card.classList.toggle('has-note',hasNote);
  if(indicator)indicator.textContent=hasNote?'لديه ملاحظات':'';
}

function cardFor(definition){
  const article=document.createElement('article');
  article.className='scene-card';
  article.dataset.type=definition.type;
  article.dataset.entityKind=definition.kind;
  article.dataset.entityId=definition.id;
  if(definition.kind==='scene')article.dataset.scene=definition.id;
  else article.dataset.element=definition.id;
  article.dataset.previewState='idle';

  const preview=document.createElement('div');
  preview.className='scene-preview';
  preview.onclick=()=>openEntity(definition);
  const iframe=document.createElement('iframe');
  iframe.title=`معاينة ${displayName(definition)}`;
  iframe.loading='lazy';
  iframe.src='about:blank';
  iframe.dataset.src=entityUrl(definition,true);
  iframe.setAttribute('tabindex','-1');
  const previewState=document.createElement('div');
  previewState.className='scene-preview-state';
  previewState.innerHTML=`<div class="scene-preview-mark">${definition.mark}</div><strong>${displayName(definition)}</strong><span>جارٍ تجهيز المعاينة</span>`;
  preview.append(iframe,previewState);

  const meta=document.createElement('div');
  meta.className='scene-meta';
  const copy=document.createElement('div');
  copy.className='scene-copy';
  const type=document.createElement('span');
  type.className='scene-type';
  type.textContent=definition.label;
  const title=document.createElement('h2');
  title.className='scene-title';
  title.textContent=displayName(definition);
  const desc=document.createElement('p');
  desc.className='scene-desc';
  desc.textContent=definition.description;
  const source=document.createElement('code');
  source.className='scene-code';
  source.textContent=definition.sourceKey;
  const noteIndicator=document.createElement('span');
  noteIndicator.className='scene-note-indicator';
  copy.append(type,title,desc,source,noteIndicator);

  const actions=document.createElement('div');
  actions.className='scene-actions';
  const open=document.createElement('button');
  open.type='button';
  open.className='scene-open';
  open.setAttribute('aria-label',`فتح ${displayName(definition)}`);
  open.textContent='↗';
  open.onclick=event=>{event.stopPropagation();openEntity(definition)};
  const edit=document.createElement('button');
  edit.type='button';
  edit.className='scene-edit';
  edit.setAttribute('aria-label',`ملاحظات وتسمية ${displayName(definition)}`);
  edit.textContent='✎';
  edit.onclick=event=>{event.stopPropagation();openEditor(definition)};
  actions.append(open,edit);
  meta.append(copy,actions);
  article.append(preview,meta);
  article.tabIndex=0;
  article.onkeydown=event=>{
    if(event.key==='Enter'){event.preventDefault();openEntity(definition)}
    if(event.key===' '){event.preventDefault();openEditor(definition)}
  };
  updateCardState(article,definition);
  previewObserver.observe(article);
  return article;
}

function renderCards(){
  previewObserver.disconnect();
  grid.innerHTML='';
  developerDefinitions.forEach(definition=>grid.append(cardFor(definition)));
  applyFilter();
}

function definitionForCard(card){
  return developerDefinitions.find(definition=>definition.kind===card.dataset.entityKind&&definition.id===card.dataset.entityId)||null;
}

function applyFilter(){
  let visible=0;
  let visibleKind='مشهد';
  grid.querySelectorAll('.scene-card').forEach(card=>{
    const definition=definitionForCard(card);
    const show=activeFilter==='elements'
      ?definition?.kind==='element'
      :definition?.kind==='scene'&&(activeFilter==='all'||definition.type===activeFilter);
    card.hidden=!show;
    if(show){visible++;if(card.dataset.previewState==='idle')previewObserver.observe(card)}
  });
  if(activeFilter==='elements')visibleKind='عنصر';
  count.textContent=`${visible} ${visible===1?visibleKind:(activeFilter==='elements'?'عناصر':'مشاهد')}`;
}

function updateVisibleNames(definition){
  const card=grid.querySelector(`.scene-card[data-entity-kind="${definition.kind}"][data-entity-id="${definition.id}"]`);
  if(card)updateCardState(card,definition);
  if(activeStageEntity&&definitionKey(activeStageEntity)===definitionKey(definition))stageTitle.textContent=`D1 · ${displayName(definition)}`;
}

function editorDraft(){
  if(!activeEditorEntity)return null;
  return{
    entityType:activeEditorEntity.kind,
    entityId:activeEditorEntity.id,
    sourceKey:activeEditorEntity.sourceKey,
    displayName:nameInput.value.trim(),
    notes:notesInput.value
  };
}

function storeDraftLocally(definition,draft,pending=true){
  const key=definitionKey(definition);
  stateByKey.set(key,{
    displayName:draft.displayName,
    notes:draft.notes,
    updatedAt:new Date().toISOString(),
    pending,
    source:'local'
  });
  persistLocal();
  updateVisibleNames(definition);
}

async function pushDraft(definition,draft,{quiet=false}={}){
  storeDraftLocally(definition,draft,true);
  if(!quiet){saveButton.disabled=true;setStatus('جارٍ الحفظ المشترك…')}
  try{
    const response=await fetch(API_URL,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(draft)
    });
    if(!response.ok)throw new Error(`store_${response.status}`);
    const data=await response.json();
    if(!data?.ok||!data.entity)throw new Error('invalid_store_response');
    stateByKey.set(definitionKey(definition),{
      displayName:String(data.entity.displayName||''),
      notes:String(data.entity.notes||''),
      updatedAt:String(data.entity.updatedAt||new Date().toISOString()),
      pending:false,
      source:'shared'
    });
    persistLocal();
    remoteAvailable=true;
    updateVisibleNames(definition);
    if(activeEditorEntity&&definitionKey(activeEditorEntity)===definitionKey(definition))setStatus('تم الحفظ في المخزن المشترك','ok');
    return true;
  }catch(error){
    console.warn('[Yakolak] D1 shared save unavailable; local copy retained',error);
    if(activeEditorEntity&&definitionKey(activeEditorEntity)===definitionKey(definition))setStatus('حُفظ محليًا وسيُعاد رفعه تلقائيًا','warn');
    return false;
  }finally{
    if(!quiet)saveButton.disabled=false;
  }
}

async function saveEditor({quiet=false}={}){
  if(!activeEditorEntity)return false;
  clearTimeout(saveTimer);
  const definition=activeEditorEntity;
  const draft=editorDraft();
  if(!draft)return false;
  dirty=false;
  return pushDraft(definition,draft,{quiet});
}

function scheduleSave(){
  if(!activeEditorEntity)return;
  dirty=true;
  storeDraftLocally(activeEditorEntity,editorDraft(),true);
  setStatus('تغييرات غير مرفوعة بعد','warn');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveEditor({quiet:true}),850);
}

function openEditor(definition){
  if(activeEditorEntity&&dirty)saveEditor({quiet:true});
  activeEditorEntity=definition;
  dirty=false;
  const current=stateFor(definition);
  nameInput.value=current.displayName||definition.defaultName;
  notesInput.value=current.notes||'';
  editorEntity.textContent=`${definition.kind==='element'?'عنصر':'مشهد'} · ${displayName(definition)}`;
  codeKey.textContent=definition.sourceKey;
  setStatus(current.pending?'محفوظ محليًا وبانتظار المزامنة':current.source==='shared'?'محفوظ في المخزن المشترك':'جاهز',current.pending?'warn':current.source==='shared'?'ok':'');
  editor.classList.add('open');
  editorScrim.classList.add('open');
  editor.setAttribute('aria-hidden','false');
  editorScrim.setAttribute('aria-hidden','false');
  notesToggle.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>nameInput.focus({preventScroll:true}));
}

function closeEditor(){
  if(activeEditorEntity&&dirty)saveEditor({quiet:true});
  editor.classList.remove('open');
  editorScrim.classList.remove('open');
  editor.setAttribute('aria-hidden','true');
  editorScrim.setAttribute('aria-hidden','true');
  notesToggle.setAttribute('aria-expanded','false');
  activeEditorEntity=null;
  dirty=false;
}

function openEntity(definition){
  activeStageEntity=definition;
  stageFrame.src=entityUrl(definition,false);
  stageTitle.textContent=`D1 · ${displayName(definition)}`;
  stage.classList.add('open');
  stage.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  back.focus({preventScroll:true});
  const hashKey=definition.kind==='element'?'element':'scene';
  history.pushState({developerEntity:definitionKey(definition)},'',`#${hashKey}=${definition.id}`);
}

function closeEntity({historyBack=false}={}){
  if(!stage.classList.contains('open'))return;
  closeEditor();
  stage.classList.remove('open');
  stage.setAttribute('aria-hidden','true');
  stageFrame.src='about:blank';
  document.body.style.overflow='';
  activeStageEntity=null;
  if(historyBack&&location.hash)history.back();
}

async function loadSharedState(){
  try{
    const response=await fetch(API_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`store_${response.status}`);
    const data=await response.json();
    if(!data?.ok||!Array.isArray(data.entities))throw new Error('invalid_store_response');
    data.entities.forEach(entity=>{
      const key=`${entity.entityType}:${entity.entityId}`;
      const local=stateByKey.get(key);
      if(local?.pending)return;
      stateByKey.set(key,{
        displayName:String(entity.displayName||''),
        notes:String(entity.notes||''),
        updatedAt:String(entity.updatedAt||''),
        pending:false,
        source:'shared'
      });
    });
    remoteAvailable=true;
    persistLocal();
    renderCards();
    document.body.dataset.developerStore='shared';
  }catch(error){
    console.info('[Yakolak] D1 shared store unavailable in this environment',error);
    document.body.dataset.developerStore='local';
  }
  const pending=developerDefinitions.filter(definition=>stateFor(definition).pending);
  for(const definition of pending){
    const current=stateFor(definition);
    await pushDraft(definition,{
      entityType:definition.kind,
      entityId:definition.id,
      sourceKey:definition.sourceKey,
      displayName:current.displayName,
      notes:current.notes
    },{quiet:true});
  }
  document.body.dataset.developerSharedReady='true';
}

notesToggle.onclick=()=>{if(activeStageEntity)openEditor(activeStageEntity)};
editorClose.onclick=closeEditor;
editorScrim.onclick=closeEditor;
saveButton.onclick=()=>saveEditor();
nameInput.addEventListener('input',scheduleSave);
notesInput.addEventListener('input',scheduleSave);
back.onclick=()=>closeEntity({historyBack:true});
addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(editor.classList.contains('open'))closeEditor();
  else closeEntity({historyBack:true});
});
addEventListener('popstate',()=>{if(!location.hash)closeEntity()});
addEventListener('beforeunload',()=>{if(activeEditorEntity&&dirty)storeDraftLocally(activeEditorEntity,editorDraft(),true)});

loadLocal();
renderTabs();
renderCards();
document.body.dataset.developerBuild='D1';
loadSharedState();
