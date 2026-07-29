import {sceneDefinitions,elementDefinitions,variantsFor,contractFor} from './developer-d4-registry.js';

const API_URL='./api/developer-president';
const LEDGER_URL='./ops/ai-team/development-ledger.json';
const KIND_LABEL={scene:'مشهد',journey:'رحلة',element:'عنصر',task:'مهمة'};
const STATUS_LABEL={planned:'خطة',in_progress:'تحت التنفيذ',review:'للمراجعة',done:'تمت'};
const STATUS_ORDER=['planned','in_progress','review','done'];
const state={filter:'all',query:'',content:[],tasks:[],taskStates:new Map(),contentStates:new Map(),comments:[],current:null,channelAvailable:false,previewSources:[],previewSourceIndex:0,previewVersionIndex:0};

const grid=document.querySelector('#contentGrid');
const filters=document.querySelector('#filters');
const searchInput=document.querySelector('#searchInput');
const globalTaskComposer=document.querySelector('#globalTaskComposer');
const globalTaskForm=document.querySelector('#globalTaskForm');
const modal=document.querySelector('#contentModal');
const modalKind=document.querySelector('#modalKind');
const modalTitle=document.querySelector('#modalTitle');
const modalDescription=document.querySelector('#modalDescription');
const removeCurrent=document.querySelector('#removeCurrent');
const mediaSection=document.querySelector('#mediaSection');
const mediaViewport=document.querySelector('#mediaViewport');
const previewControls=document.querySelector('#previewControls');
const previewItemField=document.querySelector('#previewItemField');
const previewItemLabel=document.querySelector('#previewItemLabel');
const previewItemSelect=document.querySelector('#previewItemSelect');
const previewVersionField=document.querySelector('#previewVersionField');
const previewVersionSelect=document.querySelector('#previewVersionSelect');
const linkedTasksSection=document.querySelector('#linkedTasksSection');
const linkedTaskForm=document.querySelector('#linkedTaskForm');
const linkedTasks=document.querySelector('#linkedTasks');

function text(value){return String(value??'').trim()}
function baseUrl(){return new URL('./',window.location.href).href}
function unique(values){return [...new Set(values.filter(Boolean))]}
function safeId(value){return String(value).replace(/[^a-zA-Z0-9:_-]/g,'-').slice(0,160)}
function contentKey(item){return safeId(`content:${item.kind}:${item.id}`)}
function taskState(taskId){return state.taskStates.get(taskId)||{taskId,status:'planned',position:Number.MAX_SAFE_INTEGER,deleted:false}}
function isDeletedContent(item){return state.contentStates.get(contentKey(item))?.deleted===true}

function normalize(value){
  return text(value).toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function bigrams(value){
  const compact=value.replace(/\s+/g,' ');if(compact.length<2)return new Set([compact]);
  return new Set(Array.from({length:compact.length-1},(_,index)=>compact.slice(index,index+2)));
}
function fuzzyScore(query,value){
  const needle=normalize(query),haystack=normalize(value);if(!needle)return 1;if(!haystack)return 0;
  if(haystack===needle)return 1000;
  if(haystack.includes(needle))return 700- Math.min(200,haystack.indexOf(needle));
  const a=bigrams(needle),b=bigrams(haystack);let shared=0;for(const gram of a)if(b.has(gram))shared+=1;
  let cursor=0;for(const character of haystack)if(character===needle[cursor])cursor+=1;
  return (2*shared/Math.max(1,a.size+b.size))*500+(cursor/needle.length)*180;
}

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
function ledgerStatus(value){
  const status=text(value).toLowerCase();
  if(['done','complete','completed'].includes(status))return'done';
  if(['review','artifact_ready'].includes(status))return'review';
  return status==='in_progress'?'in_progress':'planned';
}
function taskRelation(task){
  const context=task.context&&typeof task.context==='object'?task.context:{};
  return text(task.scene||task.sceneId||context.scene||task.element||task.elementId||context.element||task.journey||task.journeyId||context.journey);
}
function imageUrlsForTask(task){
  const evidence=Array.isArray(task.links?.evidence)?task.links.evidence:[];
  return unique([task.imageUrl,...evidence.map(entry=>entry?.url)].filter(value=>/\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(String(value||''))));
}
function ledgerTasks(ledger){
  let activeAssigned=[...state.taskStates.values()].some(entry=>entry.status==='in_progress'&&!entry.deleted);
  return (Array.isArray(ledger?.tasks)?ledger.tasks:[]).map((task,index)=>{
    let status=ledgerStatus(task.status);
    if(!state.taskStates.has(task.id)){
      if(status==='in_progress'){if(activeAssigned)status='planned';else activeAssigned=true}
      state.taskStates.set(task.id,{taskId:task.id,status,position:index,deleted:false});
    }
    return{id:text(task.id),kind:'task',title:text(task.title)||'مهمة',description:text(task.outcome),parentType:'none',parentId:'root-task-list',attachments:imageUrlsForTask(task).map(url=>({name:'مرفق',type:'image',data:url})),ledger:task,createdBy:'manager'};
  });
}
function legacyMessageTasks(messages,startPosition){
  return (messages||[]).filter(message=>message.itemType==='content').map((message,index)=>{
    const [,parentType='none',...idParts]=text(message.itemId).split(':');
    const parentId=idParts.join(':')||'root-task-list';
    const id=safeId(`legacy-${message.id}`);
    if(!state.taskStates.has(id))state.taskStates.set(id,{taskId:id,status:'planned',position:startPosition+index,deleted:false});
    return{id,kind:'task',title:text(message.body).slice(0,240),description:'',parentType,parentId,attachments:[],createdBy:'president',legacy:true};
  });
}
function mergeTasks(ledger,payload){
  for(const entry of payload.taskStates||[])state.taskStates.set(entry.taskId,entry);
  const canonical=ledgerTasks(ledger),custom=(payload.tasks||[]).map(task=>({...task,kind:'task'}));
  const byId=new Map(canonical.map(task=>[task.id,task]));
  for(const task of custom)byId.set(task.id,{...byId.get(task.id),...task,kind:'task'});
  for(const task of legacyMessageTasks(payload.messages,byId.size))if(!byId.has(task.id))byId.set(task.id,task);
  state.tasks=[...byId.values()];
}
function sortedTasks(){
  return state.tasks.filter(task=>!taskState(task.id).deleted).sort((left,right)=>taskState(left.id).position-taskState(right.id).position||left.title.localeCompare(right.title,'ar'));
}
function commentsForTask(task){
  const updates=task.ledger?unique([text(task.ledger.progress?.label),text(task.ledger.nextAction)]).map((body,index)=>({id:`update-${task.id}-${index}`,taskId:task.id,authorRole:'manager',body,attachments:[]})):[];
  return [...updates,...state.comments.filter(comment=>comment.taskId===task.id)];
}
function taskParentTitle(task){return task.parentType==='none'?'':state.content.find(item=>item.kind===task.parentType&&item.id===task.parentId)?.title||''}
function taskSearchText(task){return [task.title,task.description,task.parentId,...commentsForTask(task).map(comment=>comment.body)].join(' ')}

function visibleEntries(){
  const content=state.content.filter(item=>!isDeletedContent(item));
  const tasks=sortedTasks();
  let entries=state.filter==='task'?tasks:state.filter==='all'?[...content,...tasks]:content.filter(item=>item.kind===state.filter);
  if(state.query)entries=entries.map(item=>({item,score:fuzzyScore(state.query,item.kind==='task'?taskSearchText(item):`${item.title} ${item.description}`)})).sort((a,b)=>b.score-a.score).slice(0,30).map(entry=>entry.item);
  return entries;
}

function createContentCard(item){
  const card=document.createElement('button');card.type='button';card.className='content-card';card.dataset.itemId=`${item.kind}:${item.id}`;
  const kind=document.createElement('span');kind.className='card-kind';kind.textContent=KIND_LABEL[item.kind];
  const title=document.createElement('strong');title.className='card-title';title.textContent=item.title;
  const description=document.createElement('span');description.className='card-description';description.textContent=item.description;
  card.append(kind,title,description);card.addEventListener('click',()=>openContent(item));return card;
}
function createStatusSelect(task){
  const select=document.createElement('select');select.className=`status-select status-${taskState(task.id).status}`;select.setAttribute('aria-label','حالة المهمة');
  for(const status of STATUS_ORDER){const option=document.createElement('option');option.value=status;option.textContent=STATUS_LABEL[status];option.selected=taskState(task.id).status===status;select.append(option)}
  select.addEventListener('click',event=>event.stopPropagation());
  select.addEventListener('change',async event=>{event.stopPropagation();await updateTaskStatus(task,event.target.value)});
  return select;
}
function createTaskRow(task,{draggable=false}={}){
  const row=document.createElement('article');row.className='task-row';row.dataset.taskId=task.id;
  if(draggable){const handle=document.createElement('button');handle.type='button';handle.className='drag-handle';handle.textContent='سحب';handle.setAttribute('aria-label',`إعادة ترتيب ${task.title}`);wireDragHandle(handle,row);row.append(handle)}
  const copy=document.createElement('button');copy.type='button';copy.className='task-copy';
  const title=document.createElement('strong');title.textContent=task.title;copy.append(title);
  const context=[taskParentTitle(task),task.description].filter(Boolean).join(' — ');
  if(context){const description=document.createElement('span');description.textContent=context;copy.append(description)}
  copy.addEventListener('click',()=>openTask(task));
  const actions=document.createElement('div');actions.className='task-row-actions';
  const remove=document.createElement('button');remove.type='button';remove.className='row-remove';remove.textContent='إزالة';remove.addEventListener('click',()=>removeTask(task));
  actions.append(createStatusSelect(task),remove);row.append(copy,actions);return row;
}
function renderGrid(){
  grid.replaceChildren();grid.classList.toggle('task-mode',state.filter==='task');
  globalTaskComposer.hidden=state.filter!=='task'||!state.channelAvailable;
  const entries=visibleEntries();
  if(!entries.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='لا توجد نتائج';grid.append(empty);return}
  for(const item of entries)grid.append(item.kind==='task'?createTaskRow(item,{draggable:state.filter==='task'&&!state.query}):createContentCard(item));
}

function sourceForDefinition(definition){return{id:definition.id,title:definition.defaultName,definition,versions:variantsFor(definition)}}
function previewSourcesFor(item){
  if(item.kind==='scene'||item.kind==='element')return[sourceForDefinition(item.definition)];
  if(item.kind==='journey')return item.scenes.map(sourceForDefinition);
  return(item.attachments||[]).map((attachment,index)=>({id:`attachment-${index}`,title:attachment.name||`مرفق ${index+1}`,attachment,versions:[{id:'current',name:'الحالي'}]}));
}
function fillSelect(select,options,selectedIndex){
  select.replaceChildren(...options.map((option,index)=>{const element=document.createElement('option');element.value=String(index);element.textContent=option.title||option.name;element.selected=index===selectedIndex;return element}));
}
function renderPreviewSelectors(){
  const source=state.previewSources[state.previewSourceIndex];
  previewItemField.hidden=state.previewSources.length<=1;
  previewItemLabel.textContent=state.current?.kind==='journey'?'المشهد':'المرفق';
  fillSelect(previewItemSelect,state.previewSources,state.previewSourceIndex);
  const versions=source?.versions||[];
  if(state.previewVersionIndex>=versions.length)state.previewVersionIndex=0;
  previewVersionField.hidden=versions.length<=1;
  fillSelect(previewVersionSelect,versions,state.previewVersionIndex);
  previewControls.hidden=previewItemField.hidden&&previewVersionField.hidden;
}
function renderPreview(){
  mediaViewport.replaceChildren();
  const source=state.previewSources[state.previewSourceIndex];
  mediaSection.hidden=!source;if(!source)return;
  renderPreviewSelectors();
  if(source.attachment){
    const data=source.attachment.data||'';
    if(String(source.attachment.type).startsWith('image')||String(data).startsWith('data:image')){const image=document.createElement('img');image.src=data;image.alt=source.title;mediaViewport.append(image)}
    else{const link=document.createElement('a');link.className='attachment-preview';link.href=data;link.download=source.attachment.name||'attachment';link.textContent=source.attachment.name||'فتح المرفق';mediaViewport.append(link)}
    return;
  }
  const version=source.versions[state.previewVersionIndex];
  if(!version)return;
  const frame=document.createElement('iframe');frame.src=contractFor(source.definition,version.id,baseUrl()).previewUrl;frame.title=`${source.title} — ${version.name}`;mediaViewport.append(frame);
}

function attachmentLink(attachment){
  const link=document.createElement('a');link.className='attachment-link';link.href=attachment.data;link.download=attachment.name||'attachment';link.textContent=attachment.name||'مرفق';return link;
}
function createComment(comment){
  const manager=comment.authorRole==='manager';
  const article=document.createElement('article');article.className=`comment ${manager?'rashed':'ahmad'}`;
  const header=document.createElement('strong');header.textContent=manager?'راشد':'أحمد';article.append(header);
  if(comment.body){const body=document.createElement('p');body.textContent=comment.body;article.append(body)}
  if(comment.attachments?.length){const attachments=document.createElement('div');attachments.className='attachment-list';attachments.append(...comment.attachments.map(attachmentLink));article.append(attachments)}
  return article;
}
function createCommentForm(task){
  const form=document.createElement('form');form.className='comment-form';form.hidden=!state.channelAvailable;
  const input=document.createElement('textarea');input.name='body';input.rows=1;input.maxLength=12000;input.placeholder='أضف تحديثًا أو تعليقًا';
  const fileLabel=document.createElement('label');fileLabel.className='attachment-button';fileLabel.textContent='مرفق';
  const file=document.createElement('input');file.name='attachments';file.type='file';file.multiple=true;file.accept='image/*,application/pdf,text/plain';fileLabel.append(file);
  const submit=document.createElement('button');submit.type='submit';submit.textContent='إرسال';form.append(input,fileLabel,submit);
  form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{const attachments=await filesToAttachments(file.files);if(!text(input.value)&&!attachments.length)return;const result=await post({action:'task_comment',id:`comment-${Date.now()}-${crypto.randomUUID()}`,taskId:task.id,body:input.value,attachments});state.comments.push(result.comment);input.value='';file.value='';renderModalTasks()}finally{submit.disabled=false}});
  return form;
}
function createTaskDetail(task,{open=false}={}){
  const details=document.createElement('details');details.className='task-detail';details.open=open;details.dataset.taskId=task.id;
  const summary=document.createElement('summary');
  const title=document.createElement('strong');title.textContent=task.title;summary.append(title,createStatusSelect(task));details.append(summary);
  const body=document.createElement('div');body.className='task-detail-body';
  if(task.description){const description=document.createElement('p');description.className='description';description.textContent=task.description;body.append(description)}
  if(task.attachments?.length){const attachments=document.createElement('div');attachments.className='attachment-list';attachments.append(...task.attachments.map(attachmentLink));body.append(attachments)}
  const comments=document.createElement('div');comments.className='comments';comments.append(...commentsForTask(task).map(createComment));body.append(comments,createCommentForm(task));
  const remove=document.createElement('button');remove.type='button';remove.className='detail-remove';remove.textContent='إزالة المهمة';remove.addEventListener('click',()=>removeTask(task));body.append(remove);
  details.append(body);return details;
}
function linkedTasksFor(item){return sortedTasks().filter(task=>task.parentType===item.kind&&task.parentId===item.id)}
function renderModalTasks(){
  linkedTasks.replaceChildren();if(!state.current)return;
  if(state.current.kind==='task'){linkedTasks.append(createTaskDetail(state.current,{open:true}));return}
  linkedTasks.append(...linkedTasksFor(state.current).map(task=>createTaskDetail(task,{open:true})));
}
function openContent(item){
  state.current=item;state.previewSources=previewSourcesFor(item);state.previewSourceIndex=0;state.previewVersionIndex=0;
  modalKind.textContent=KIND_LABEL[item.kind];modalTitle.textContent=item.title;modalDescription.textContent=item.description;modalDescription.hidden=!item.description;
  removeCurrent.hidden=false;linkedTaskForm.hidden=!state.channelAvailable;renderPreview();renderModalTasks();modal.showModal();
}
function openTask(task){
  state.current=task;state.previewSources=previewSourcesFor(task);state.previewSourceIndex=0;state.previewVersionIndex=0;
  modalKind.textContent='مهمة';modalTitle.textContent=task.title;modalDescription.textContent='';modalDescription.hidden=true;
  removeCurrent.hidden=false;linkedTaskForm.hidden=true;renderPreview();renderModalTasks();modal.showModal();
}

async function filesToAttachments(fileList){
  const files=[...(fileList||[])].slice(0,3);let total=0;
  return Promise.all(files.map(file=>new Promise((resolve,reject)=>{
    if(file.size>1_100_000){reject(new Error('الملف أكبر من الحد المسموح'));return}
    total+=file.size;if(total>1_900_000){reject(new Error('المرفقات أكبر من الحد المسموح'));return}
    const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type||'text/plain',data:String(reader.result)});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
  })));
}
async function post(payload){
  const response=await fetch(API_URL,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'save_failed');return result;
}
async function createTaskFromForm(form,parent){
  const title=text(form.elements.title.value);if(!title)return;
  const attachments=await filesToAttachments(form.elements.attachments.files);
  const result=await post({action:'task_create',id:`task-${Date.now()}-${crypto.randomUUID()}`,parentType:parent?.kind||'none',parentId:parent?.id||'root-task-list',title,description:'',attachments});
  state.tasks.push({...result.task,kind:'task'});const maximum=Math.max(-1,...[...state.taskStates.values()].map(entry=>Number(entry.position)||0));state.taskStates.set(result.task.id,{taskId:result.task.id,status:'planned',position:maximum+1,deleted:false});
  form.reset();renderGrid();renderModalTasks();
}
async function updateTaskStatus(task,status){
  if(status==='done'&&!window.confirm('اعتماد المهمة كمكتملة؟')){renderGrid();renderModalTasks();return}
  const result=await post({action:'task_status',taskId:task.id,status});
  if(status==='in_progress')for(const [id,entry]of state.taskStates)if(entry.status==='in_progress'&&id!==task.id)state.taskStates.set(id,{...entry,status:'planned'});
  state.taskStates.set(task.id,result.taskState);renderGrid();renderModalTasks();
}
async function removeTask(task){
  if(!window.confirm('إزالة المهمة؟'))return;
  const result=await post({action:'task_delete',taskId:task.id});state.taskStates.set(task.id,result.taskState);if(state.current?.id===task.id)modal.close();renderGrid();renderModalTasks();
}
async function removeContent(item){
  if(!window.confirm(`إزالة ${KIND_LABEL[item.kind]}؟`))return;
  const result=await post({action:'content_delete',itemId:contentKey(item)});state.contentStates.set(result.contentState.itemId,result.contentState);modal.close();renderGrid();
}

function wireDragHandle(handle,row){
  let active=false;
  const finish=async()=>{
    if(!active)return;active=false;row.classList.remove('moving');
    const ids=[...grid.querySelectorAll('.task-row')].map(element=>element.dataset.taskId);
    ids.forEach((id,position)=>state.taskStates.set(id,{...taskState(id),position}));
    try{await post({action:'task_reorder',taskIds:ids})}catch{renderGrid()}
  };
  handle.addEventListener('pointerdown',event=>{active=true;row.classList.add('moving');handle.setPointerCapture(event.pointerId);window.addEventListener('pointerup',finish,{once:true});event.preventDefault()});
  handle.addEventListener('pointermove',event=>{
    if(!active)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.task-row');if(!target||target===row)return;
    const rect=target.getBoundingClientRect();if(event.clientY<rect.top+rect.height/2)target.before(row);else target.after(row);
  });
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
}

async function readJson(url){const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});if(!response.ok)throw new Error(`read_failed_${response.status}`);return response.json()}
async function start(){
  const [ledger,payload]=await Promise.all([readJson(LEDGER_URL).catch(()=>({tasks:[]})),readJson(API_URL).catch(()=>({ok:false,tasks:[],taskStates:[],contentStates:[],taskComments:[],messages:[]}))]);
  state.channelAvailable=Boolean(payload.ok);state.contentStates=new Map((payload.contentStates||[]).map(entry=>[entry.itemId,entry]));state.comments=payload.taskComments||[];state.content=contentItems();mergeTasks(ledger,payload);renderGrid();document.body.dataset.developerReady='true';
}

filters.addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;state.filter=button.dataset.filter;filters.querySelectorAll('[data-filter]').forEach(candidate=>candidate.classList.toggle('active',candidate===button));renderGrid()});
searchInput.addEventListener('input',()=>{state.query=searchInput.value;renderGrid()});
globalTaskForm.addEventListener('submit',async event=>{event.preventDefault();await createTaskFromForm(globalTaskForm,null)});
linkedTaskForm.addEventListener('submit',async event=>{event.preventDefault();if(state.current?.kind!=='task')await createTaskFromForm(linkedTaskForm,state.current)});
removeCurrent.addEventListener('click',()=>state.current?.kind==='task'?removeTask(state.current):removeContent(state.current));
document.querySelector('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close()});
modal.addEventListener('close',()=>{mediaViewport.replaceChildren();state.current=null;state.previewSources=[]});
previewItemSelect.addEventListener('change',()=>{state.previewSourceIndex=Number(previewItemSelect.value);state.previewVersionIndex=0;renderPreview()});
previewVersionSelect.addEventListener('change',()=>{state.previewVersionIndex=Number(previewVersionSelect.value);renderPreview()});

start();
