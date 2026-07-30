import {sceneDefinitions,elementDefinitions,variantsFor,contractFor} from './developer-d4-registry.js';

const API_URL='./api/developer-president';
const SHEET_URL='https://docs.google.com/spreadsheets/d/1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c/edit';
const KIND_LABEL={scene:'مشهد',journey:'رحلة',element:'عنصر',task:'مهمة'};
const STATUS_LABEL={planned:'جديدة',in_progress:'قيد التنفيذ',review:'للمراجعة',done:'مكتملة'};
const state={filter:'all',query:'',content:[],tasks:[],comments:[],work:[],current:null,previewSources:[],previewSourceIndex:0,previewVersionIndex:0,previewFrame:null,previewTimer:null};

const grid=document.querySelector('#contentGrid');
const filters=document.querySelector('#filters');
const searchInput=document.querySelector('#searchInput');
const refreshButton=document.querySelector('#refreshButton');
const databaseLink=document.querySelector('#databaseLink');
const syncStatus=document.querySelector('#syncStatus');
const modal=document.querySelector('#contentModal');
const modalKind=document.querySelector('#modalKind');
const modalTitle=document.querySelector('#modalTitle');
const modalDescription=document.querySelector('#modalDescription');
const modalMeta=document.querySelector('#modalMeta');
const mediaSection=document.querySelector('#mediaSection');
const mediaViewport=document.querySelector('#mediaViewport');
const previewControls=document.querySelector('#previewControls');
const previewItemField=document.querySelector('#previewItemField');
const previewItemLabel=document.querySelector('#previewItemLabel');
const previewItemSelect=document.querySelector('#previewItemSelect');
const previewVersionField=document.querySelector('#previewVersionField');
const previewVersionSelect=document.querySelector('#previewVersionSelect');
const linkedTasksSection=document.querySelector('#linkedTasksSection');
const linkedTasks=document.querySelector('#linkedTasks');

function text(value){return String(value??'').trim()}
function baseUrl(){return new URL('./',window.location.href).href}
function unique(values){return [...new Set(values.filter(Boolean))]}
function normalize(value){return text(value).toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function bigrams(value){const compact=value.replace(/\s+/g,' ');if(compact.length<2)return new Set([compact]);return new Set(Array.from({length:compact.length-1},(_,index)=>compact.slice(index,index+2)))}
function fuzzyScore(query,value){const needle=normalize(query),haystack=normalize(value);if(!needle)return 1;if(!haystack)return 0;if(haystack===needle)return 1000;if(haystack.includes(needle))return 700-Math.min(200,haystack.indexOf(needle));const a=bigrams(needle),b=bigrams(haystack);let shared=0;for(const gram of a)if(b.has(gram))shared+=1;let cursor=0;for(const character of haystack)if(character===needle[cursor])cursor+=1;return(2*shared/Math.max(1,a.size+b.size))*500+(cursor/needle.length)*180}

function journeysFromScenes(){
  return unique(sceneDefinitions.map(definition=>definition.journey)).map((name,index)=>({
    id:`journey-${index+1}`,kind:'journey',title:`رحلة ${name}`,
    description:`${sceneDefinitions.filter(definition=>definition.journey===name&&definition.type!=='sequence').length} مشاهد`,
    scenes:sceneDefinitions.filter(definition=>definition.journey===name&&definition.type!=='sequence')
  }));
}
function contentItems(){
  const scenes=sceneDefinitions.filter(definition=>definition.type!=='sequence').map(definition=>({id:definition.id,kind:'scene',title:definition.defaultName,description:definition.description,definition}));
  const elements=elementDefinitions.map(definition=>({id:definition.id,kind:'element',title:definition.defaultName,description:definition.description,definition}));
  return [...journeysFromScenes(),...scenes,...elements];
}
function taskSearchText(task){return[task.title,task.description,task.owner,task.parentId,...state.comments.filter(entry=>entry.taskId===task.id).map(entry=>entry.body),...state.work.filter(entry=>entry.taskId===task.id).map(entry=>entry.body)].join(' ')}
function visibleEntries(){
  const content=state.content;
  let entries=state.filter==='task'?state.tasks:state.filter==='all'?[...content,...state.tasks]:content.filter(item=>item.kind===state.filter);
  if(state.query)entries=entries.map(item=>({item,score:fuzzyScore(state.query,item.kind==='task'?taskSearchText(item):`${item.title} ${item.description}`)})).filter(entry=>entry.score>30).sort((a,b)=>b.score-a.score).slice(0,40).map(entry=>entry.item);
  return entries;
}
function statusPill(task){const pill=document.createElement('span');pill.className=`status-pill status-${task.status}`;pill.textContent=STATUS_LABEL[task.status]||task.status||'جديدة';return pill}
function createContentCard(item){
  const card=document.createElement('button');card.type='button';card.className='content-card';card.dataset.itemId=`${item.kind}:${item.id}`;
  const kind=document.createElement('span');kind.className='card-kind';kind.textContent=KIND_LABEL[item.kind];
  const title=document.createElement('strong');title.className='card-title';title.textContent=item.title;
  const description=document.createElement('span');description.className='card-description';description.textContent=item.description;
  card.append(kind,title,description);card.addEventListener('click',()=>openItem(item));return card;
}
function createTaskRow(task){
  const row=document.createElement('article');row.className='task-row';row.dataset.taskId=task.id;
  const copy=document.createElement('button');copy.type='button';copy.className='task-copy';
  const title=document.createElement('strong');title.textContent=task.title;const description=document.createElement('span');description.textContent=task.description||task.parentId||'';copy.append(title,description);copy.addEventListener('click',()=>openItem(task));
  const meta=document.createElement('div');meta.className='task-meta';meta.append(statusPill(task));if(task.owner){const owner=document.createElement('span');owner.className='owner';owner.textContent=task.owner;meta.append(owner)}row.append(copy,meta);return row;
}
function renderGrid(){
  grid.replaceChildren();grid.classList.toggle('task-mode',state.filter==='task');
  const entries=visibleEntries();if(!entries.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='لا توجد نتائج';grid.append(empty);return}
  for(const item of entries)grid.append(item.kind==='task'?createTaskRow(item):createContentCard(item));
}

function sourceForDefinition(definition){return{id:definition.id,title:definition.defaultName,definition,versions:variantsFor(definition)}}
function previewSourcesFor(item){
  if(item.kind==='scene'||item.kind==='element')return[sourceForDefinition(item.definition)];
  if(item.kind==='journey')return item.scenes.map(sourceForDefinition);
  return(item.attachments||[]).filter(attachment=>attachment.type==='image').map((attachment,index)=>({id:`attachment-${index}`,title:attachment.name||`مرفق ${index+1}`,attachment,versions:[{id:'current',name:'الحالي'}]}));
}
function fillSelect(select,options,selectedIndex){select.replaceChildren(...options.map((option,index)=>{const element=document.createElement('option');element.value=String(index);element.textContent=option.title||option.name;element.selected=index===selectedIndex;return element}))}
function renderPreviewSelectors(){
  const source=state.previewSources[state.previewSourceIndex];previewItemField.hidden=state.previewSources.length<=1;previewItemLabel.textContent=state.current?.kind==='journey'?'المشهد':'المرفق';fillSelect(previewItemSelect,state.previewSources,state.previewSourceIndex);
  const versions=source?.versions||[];if(state.previewVersionIndex>=versions.length)state.previewVersionIndex=0;previewVersionField.hidden=versions.length<=1;fillSelect(previewVersionSelect,versions,state.previewVersionIndex);previewControls.hidden=previewItemField.hidden&&previewVersionField.hidden;
}
function showPreviewError(frame,message){if(frame!==state.previewFrame)return;clearTimeout(state.previewTimer);const error=document.createElement('div');error.className='preview-error';error.textContent=message;mediaViewport.replaceChildren(error)}
function renderPreview(){
  clearTimeout(state.previewTimer);state.previewFrame=null;mediaViewport.replaceChildren();const source=state.previewSources[state.previewSourceIndex];mediaSection.hidden=!source;if(!source)return;renderPreviewSelectors();
  if(source.attachment){const image=document.createElement('img');image.src=source.attachment.data;image.alt=source.title;mediaViewport.append(image);return}
  const version=source.versions[state.previewVersionIndex];if(!version)return;const loading=document.createElement('div');loading.className='preview-loading';const spinner=document.createElement('span');spinner.className='preview-spinner';spinner.setAttribute('aria-hidden','true');loading.append(spinner,document.createTextNode('جارٍ تجهيز المعاينة'));
  const frame=document.createElement('iframe');frame.className='preview-frame';frame.src=contractFor(source.definition,version.id,baseUrl()).previewUrl;frame.title=`${source.title} — ${version.name}`;frame.dataset.entityId=source.id;frame.dataset.variantId=version.id;state.previewFrame=frame;mediaViewport.append(loading,frame);state.previewTimer=setTimeout(()=>showPreviewError(frame,'تعذرت المعاينة'),20000);
}
window.addEventListener('message',event=>{const frame=state.previewFrame,data=event.data;if(!frame||event.source!==frame.contentWindow||!data||typeof data!=='object')return;if(data.entityId&&data.entityId!==frame.dataset.entityId)return;if(data.variant&&data.variant!==frame.dataset.variantId)return;if(data.type==='yakolak-developer-scene-ready'){clearTimeout(state.previewTimer);frame.classList.add('ready');mediaViewport.querySelector('.preview-loading')?.remove()}else if(data.type==='yakolak-developer-scene-error')showPreviewError(frame,'تعذرت معاينة هذا المحتوى')});

function metaChip(label,value,href=''){
  const chip=document.createElement('span');chip.className='meta-chip';if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noreferrer noopener';link.textContent=value;chip.append(link)}else chip.textContent=`${label}: ${value}`;return chip;
}
function taskDetail(task){
  const article=document.createElement('article');article.className='task-detail';const title=document.createElement('strong');title.textContent=task.title;const description=document.createElement('p');description.textContent=task.description||'لا توجد تفاصيل';const meta=document.createElement('div');meta.className='task-meta';meta.append(statusPill(task));if(task.owner){const owner=document.createElement('span');owner.className='owner';owner.textContent=task.owner;meta.append(owner)}article.append(title,description,meta);
  const feedEntries=[...state.comments.filter(entry=>entry.taskId===task.id),...state.work.filter(entry=>entry.taskId===task.id)].sort((a,b)=>text(a.updatedAt).localeCompare(text(b.updatedAt)));
  if(feedEntries.length){const feed=document.createElement('div');feed.className='feed';for(const entry of feedEntries){const item=document.createElement('div');item.className='feed-entry';const author=document.createElement('strong');author.textContent=entry.authorName||entry.authorRole||'تحديث';const body=document.createElement('div');body.textContent=entry.body;item.append(author,body);feed.append(item)}article.append(feed)}return article;
}
function linkedTasksFor(item){return state.tasks.filter(task=>task.parentType===item.kind&&task.parentId===item.id)}
function renderModalTasks(item){
  linkedTasks.replaceChildren();const tasks=item.kind==='task'?[item]:linkedTasksFor(item);linkedTasksSection.hidden=!tasks.length;if(tasks.length)linkedTasks.append(...tasks.map(taskDetail));
}
function renderModalMeta(item){
  modalMeta.replaceChildren();if(item.kind!=='task')return;if(item.owner)modalMeta.append(metaChip('المسؤول',item.owner));if(item.parentId&&item.parentId!=='root-task-list')modalMeta.append(metaChip('مرتبط بـ',item.parentId));if(item.updatedAt)modalMeta.append(metaChip('آخر تحديث',new Date(item.updatedAt).toLocaleString('ar-SA')));if(item.link)modalMeta.append(metaChip('', 'فتح الرابط',item.link));
}
function openItem(item){
  state.current=item;state.previewSources=previewSourcesFor(item);state.previewSourceIndex=0;state.previewVersionIndex=0;modalKind.textContent=KIND_LABEL[item.kind];modalTitle.textContent=item.title;modalDescription.textContent=item.description||'';modalDescription.hidden=!item.description;renderModalMeta(item);renderPreview();renderModalTasks(item);modal.showModal();
}

async function readData(){const response=await fetch(API_URL,{headers:{accept:'application/json'},cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(payload.error||`read_failed_${response.status}`);return payload}
async function start(){
  refreshButton.disabled=true;syncStatus.textContent='جارٍ تحديث قاعدة البيانات…';
  try{
    const payload=await readData();state.tasks=(payload.tasks||[]).map(task=>({...task,kind:'task'}));state.comments=payload.taskComments||[];state.work=payload.taskWork||[];state.content=contentItems();databaseLink.href=payload.sheetUrl||SHEET_URL;syncStatus.textContent=`تم التحديث من Google Sheets • ${state.tasks.length} مهمة`;renderGrid();document.body.dataset.developerReady='true';
  }catch(error){state.content=contentItems();state.tasks=[];state.comments=[];state.work=[];syncStatus.textContent='تعذر قراءة قاعدة البيانات — افتح الشيت';renderGrid();document.body.dataset.developerReady='true';console.error(error)}finally{refreshButton.disabled=false}
}

filters.addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;state.filter=button.dataset.filter;filters.querySelectorAll('[data-filter]').forEach(candidate=>candidate.classList.toggle('active',candidate===button));renderGrid()});
searchInput.addEventListener('input',()=>{state.query=searchInput.value;renderGrid()});
refreshButton.addEventListener('click',start);
document.querySelector('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close()});
modal.addEventListener('close',()=>{clearTimeout(state.previewTimer);state.previewFrame=null;mediaViewport.replaceChildren();state.current=null;state.previewSources=[]});
previewItemSelect.addEventListener('change',()=>{state.previewSourceIndex=Number(previewItemSelect.value);state.previewVersionIndex=0;renderPreview()});
previewVersionSelect.addEventListener('change',()=>{state.previewVersionIndex=Number(previewVersionSelect.value);renderPreview()});

start();