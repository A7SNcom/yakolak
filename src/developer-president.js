import {sceneDefinitions,elementDefinitions,variantsFor,contractFor} from './developer-d4-registry.js';

const API_URL='./api/developer-president';
const LEDGER_URL='./ops/ai-team/development-ledger.json';
const KIND_LABEL={scene:'مشهد',journey:'رحلة',element:'عنصر',task:'مهمة'};
const STATUS_LABEL={planned:'خطة',in_progress:'تحت التنفيذ',review:'للمراجعة',done:'تمت'};
const STATUS_ORDER=['planned','in_progress','review','done'];
const state={filter:'all',query:'',content:[],tasks:[],taskStates:new Map(),contentStates:new Map(),comments:[],work:[],current:null,channelAvailable:false,previewSources:[],previewSourceIndex:0,previewVersionIndex:0,editor:null,previewFrame:null,previewTimer:null};
let taskSorter=null;

const grid=document.querySelector('#contentGrid');
const filters=document.querySelector('#filters');
const searchInput=document.querySelector('#searchInput');
const globalTaskComposer=document.querySelector('#globalTaskComposer');
const openGlobalTask=document.querySelector('#openGlobalTask');
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
const openLinkedTask=document.querySelector('#openLinkedTask');
const linkedTasks=document.querySelector('#linkedTasks');
const editorModal=document.querySelector('#editorModal');
const editorForm=document.querySelector('#editorForm');
const editorHeading=document.querySelector('#editorHeading');
const editorTitleField=document.querySelector('#editorTitleField');
const editorTitle=document.querySelector('#editorTitle');
const editorContent=document.querySelector('#editorContent');
const editorFiles=document.querySelector('#editorFiles');
const editorAttachments=document.querySelector('#editorAttachments');

function text(value){return String(value??'').trim()}
function baseUrl(){return new URL('./',window.location.href).href}
function unique(values){return [...new Set(values.filter(Boolean))]}
function safeId(value){return String(value).replace(/[^a-zA-Z0-9:_-]/g,'-').slice(0,160)}
function iconButton(name,label,className='icon-button'){const button=document.createElement('button');button.type='button';button.className=className;button.setAttribute('aria-label',label);const icon=document.createElement('span');icon.className='material-symbols-rounded';icon.setAttribute('aria-hidden','true');icon.textContent=name;button.append(icon);return button}
function appendInline(container,value){
  const pattern=/(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;let cursor=0,match;
  while((match=pattern.exec(value))){if(match.index>cursor)container.append(document.createTextNode(value.slice(cursor,match.index)));let node;if(match[2]){node=document.createElement('strong');node.textContent=match[2]}else if(match[3]){node=document.createElement('em');node.textContent=match[3]}else{node=document.createElement('a');node.textContent=match[4];node.href=match[5];node.rel='noreferrer noopener';node.target='_blank'}container.append(node);cursor=pattern.lastIndex}if(cursor<value.length)container.append(document.createTextNode(value.slice(cursor)))
}
function appendPlainRich(container,value){
  const lines=String(value||'').split(/\r?\n/);let list=null;
  for(const line of lines){const match=line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);if(match){const ordered=/\d/.test(match[1]);if(!list||list.tagName!==(ordered?'OL':'UL')){list=document.createElement(ordered?'ol':'ul');container.append(list)}const item=document.createElement('li');appendInline(item,match[2]);list.append(item);continue}list=null;const p=document.createElement('p');appendInline(p,line||' ');container.append(p)}
}
function richTextFromEditor(){
  const walk=node=>{if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';const tag=node.nodeName.toLowerCase(),inside=[...node.childNodes].map(walk).join('');if(tag==='strong'||tag==='b')return`**${inside}**`;if(tag==='em'||tag==='i')return`*${inside}*`;if(tag==='a'){const href=node.getAttribute('href')||'';return /^https?:\/\//i.test(href)?`[${inside}](${href})`:inside}if(tag==='li')return`${inside.trim()}\n`;if(tag==='ul')return[...node.children].map(child=>`- ${walk(child).trim()}\n`).join('');if(tag==='ol')return[...node.children].map((child,index)=>`${index+1}. ${walk(child).trim()}\n`).join('');if(['p','div','br'].includes(tag))return`${inside}\n`;return inside};return walk(editorContent).replace(/\n{3,}/g,'\n\n').trim().slice(0,20000)
}
function renderRich(container,value){container.replaceChildren();appendPlainRich(container,value)}
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
function workForTask(task){return state.work.filter(entry=>entry.taskId===task.id)}
function taskParentTitle(task){return task.parentType==='none'?'':state.content.find(item=>item.kind===task.parentType&&item.id===task.parentId)?.title||''}
function taskSearchText(task){return [task.title,task.description,task.parentId,...commentsForTask(task).map(comment=>comment.body),...workForTask(task).flatMap(entry=>[entry.authorName,entry.body])].join(' ')}

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
  if(draggable){const handle=iconButton('drag_indicator',`إعادة ترتيب ${task.title}`,'drag-handle icon-button');row.append(handle)}
  const copy=document.createElement('button');copy.type='button';copy.className='task-copy';
  const title=document.createElement('strong');title.textContent=task.title;copy.append(title);
  const context=[taskParentTitle(task),task.description].filter(Boolean).join(' — ');
  if(context){const description=document.createElement('span');description.textContent=context;copy.append(description)}
  copy.addEventListener('click',()=>openTask(task));
  const actions=document.createElement('div');actions.className='task-row-actions';
  const edit=iconButton('edit','تعديل المهمة');edit.addEventListener('click',()=>openTaskEditor(task));
  const remove=iconButton('delete','إزالة المهمة','icon-button danger');remove.addEventListener('click',()=>removeTask(task));
  actions.append(createStatusSelect(task),edit,remove);row.append(copy,actions);return row;
}
function renderGrid(){
  taskSorter?.destroy();taskSorter=null;
  grid.replaceChildren();grid.classList.toggle('task-mode',state.filter==='task');
  globalTaskComposer.hidden=state.filter!=='task'||!state.channelAvailable;
  const entries=visibleEntries();
  if(!entries.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='لا توجد نتائج';grid.append(empty);return}
  for(const item of entries)grid.append(item.kind==='task'?createTaskRow(item,{draggable:state.filter==='task'&&!state.query}):createContentCard(item));
  activateTaskSorting();
}

function activateTaskSorting(){
  if(state.filter!=='task'||state.query||!window.Sortable)return;
  taskSorter=window.Sortable.create(grid,{animation:160,handle:'.drag-handle',draggable:'.task-row',ghostClass:'moving',chosenClass:'chosen',forceFallback:true,fallbackTolerance:4,touchStartThreshold:3,onEnd:persistTaskOrder});
}
async function persistTaskOrder(){
  const ids=[...grid.querySelectorAll('.task-row')].map(element=>element.dataset.taskId);
  ids.forEach((id,position)=>state.taskStates.set(id,{...taskState(id),position}));
  try{await post({action:'task_reorder',taskIds:ids})}catch{renderGrid()}
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
  clearTimeout(state.previewTimer);state.previewFrame=null;
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
  const loading=document.createElement('div');loading.className='preview-loading';const spinner=document.createElement('span');spinner.className='preview-spinner';spinner.setAttribute('aria-hidden','true');const loadingLabel=document.createElement('span');loadingLabel.textContent='جارٍ تجهيز المعاينة';loading.append(spinner,loadingLabel);
  const frame=document.createElement('iframe');frame.className='preview-frame';frame.src=contractFor(source.definition,version.id,baseUrl()).previewUrl;frame.title=`${source.title} — ${version.name}`;frame.dataset.entityId=source.id;frame.dataset.variantId=version.id;state.previewFrame=frame;mediaViewport.append(loading,frame);
  state.previewTimer=setTimeout(()=>showPreviewError(frame,'تعذرت المعاينة'),20000);
}
function showPreviewError(frame,message){if(frame!==state.previewFrame)return;clearTimeout(state.previewTimer);const error=document.createElement('div');error.className='preview-error';const label=document.createElement('span');label.textContent=message;const retry=iconButton('refresh','إعادة المحاولة');retry.addEventListener('click',renderPreview);error.append(label,retry);mediaViewport.replaceChildren(error)}
window.addEventListener('message',event=>{const frame=state.previewFrame,data=event.data;if(!frame||event.source!==frame.contentWindow||!data||typeof data!=='object')return;if(data.entityId&&data.entityId!==frame.dataset.entityId)return;if(data.variant&&data.variant!==frame.dataset.variantId)return;if(data.type==='yakolak-developer-scene-ready'){clearTimeout(state.previewTimer);frame.classList.add('ready');mediaViewport.querySelector('.preview-loading')?.remove()}else if(data.type==='yakolak-developer-scene-error')showPreviewError(frame,'تعذرت معاينة هذا المحتوى')});

function attachmentLink(attachment){
  const link=document.createElement('a');link.className='attachment-link';link.href=attachment.data;link.download=attachment.name||'attachment';link.textContent=attachment.name||'مرفق';return link;
}
function createComment(comment){
  const manager=comment.authorRole==='manager';
  const article=document.createElement('article');article.className=`comment ${manager?'rashed':'ahmad'}`;
  const heading=document.createElement('div');heading.className='comment-heading';const header=document.createElement('strong');header.textContent=manager?'راشد':'أحمد';heading.append(header);if(!manager&&!String(comment.id).startsWith('update-')){const edit=iconButton('edit','تعديل الرد');edit.addEventListener('click',()=>openCommentEditor(comment));heading.append(edit)}article.append(heading);
  if(comment.body){const body=document.createElement('div');body.className='rich-copy';renderRich(body,comment.body);article.append(body)}
  if(comment.attachments?.length){const attachments=document.createElement('div');attachments.className='attachment-list';attachments.append(...comment.attachments.map(attachmentLink));article.append(attachments)}
  return article;
}
function createWorkEntry(entry){
  const article=document.createElement('article');article.className=`comment work-entry ${entry.authorRole==='manager'?'rashed':'worker'}`;
  const header=document.createElement('strong');header.textContent=entry.authorRole==='manager'?'راشد':entry.authorName;article.append(header);
  if(entry.body){const body=document.createElement('div');body.className='rich-copy';renderRich(body,entry.body);article.append(body)}
  if(entry.attachments?.length){const attachments=document.createElement('div');attachments.className='attachment-list';attachments.append(...entry.attachments.map(attachmentLink));article.append(attachments)}
  return article;
}
function createCommentButton(task){const button=iconButton('add_comment','إضافة رد','secondary-action icon-action');const label=document.createElement('span');label.textContent='إضافة رد';button.append(label);button.hidden=!state.channelAvailable;button.addEventListener('click',()=>openCommentEditor(null,task));return button}
function createTaskDetail(task,{open=false}={}){
  const details=document.createElement('details');details.className='task-detail';details.open=open;details.dataset.taskId=task.id;
  const summary=document.createElement('summary');
  const title=document.createElement('strong');title.textContent=task.title;summary.append(title,createStatusSelect(task));details.append(summary);
  const body=document.createElement('div');body.className='task-detail-body';
  if(task.description){const description=document.createElement('div');description.className='description rich-copy';renderRich(description,task.description);body.append(description)}
  if(task.attachments?.length){const attachments=document.createElement('div');attachments.className='attachment-list';attachments.append(...task.attachments.map(attachmentLink));body.append(attachments)}
  const tabs=document.createElement('div');tabs.className='task-feed-tabs';
  const conversationButton=document.createElement('button');conversationButton.type='button';conversationButton.className='active';conversationButton.textContent='أحمد وراشد';
  const workButton=document.createElement('button');workButton.type='button';workButton.textContent='الشغل';tabs.append(conversationButton,workButton);
  const feed=document.createElement('div');feed.className='comments';
  const commentButton=createCommentButton(task);
  const showConversation=()=>{conversationButton.classList.add('active');workButton.classList.remove('active');feed.replaceChildren(...commentsForTask(task).map(createComment));commentButton.hidden=!state.channelAvailable};
  const showWork=()=>{workButton.classList.add('active');conversationButton.classList.remove('active');const entries=workForTask(task);feed.replaceChildren(...entries.map(createWorkEntry));if(!entries.length){const empty=document.createElement('p');empty.className='feed-empty';empty.textContent='لا يوجد شغل مسجل';feed.append(empty)}commentButton.hidden=true};
  conversationButton.addEventListener('click',showConversation);workButton.addEventListener('click',showWork);showConversation();body.append(tabs,feed,commentButton);
  const detailActions=document.createElement('div');detailActions.className='detail-actions';const edit=iconButton('edit','تعديل المهمة');edit.addEventListener('click',()=>openTaskEditor(task));const remove=iconButton('delete','إزالة المهمة','icon-button danger');remove.addEventListener('click',()=>removeTask(task));detailActions.append(edit,remove);body.append(detailActions);
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
  removeCurrent.hidden=false;openLinkedTask.hidden=!state.channelAvailable;renderPreview();renderModalTasks();modal.showModal();
}
function openTask(task){
  state.current=task;state.previewSources=previewSourcesFor(task);state.previewSourceIndex=0;state.previewVersionIndex=0;
  modalKind.textContent='مهمة';modalTitle.textContent=task.title;modalDescription.textContent='';modalDescription.hidden=true;
  removeCurrent.hidden=false;openLinkedTask.hidden=true;renderPreview();renderModalTasks();modal.showModal();
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
function renderEditorAttachments(){editorAttachments.replaceChildren();for(const [index,attachment]of(state.editor?.attachments||[]).entries()){const chip=document.createElement('span');chip.className='attachment-chip';chip.append(document.createTextNode(attachment.name||'مرفق'));const remove=iconButton('close','إزالة المرفق');remove.addEventListener('click',()=>{state.editor.attachments.splice(index,1);renderEditorAttachments()});chip.append(remove);editorAttachments.append(chip)}}
function openEditor(config){
  state.editor={...config,attachments:[...(config.attachments||[])]};editorHeading.textContent=config.heading;editorTitleField.hidden=!config.showTitle;editorTitle.value=config.title||'';editorContent.replaceChildren();appendPlainRich(editorContent,config.body||'');editorFiles.value='';renderEditorAttachments();editorModal.showModal();setTimeout(()=>config.showTitle?editorTitle.focus():editorContent.focus(),0)
}
function openTaskEditor(task=null,parent=null){openEditor({type:task?'task-edit':'task-create',heading:task?'تعديل المهمة':'إضافة مهمة',showTitle:true,title:task?.title||'',body:task?.description||'',attachments:task?.attachments||[],task,parent})}
function openCommentEditor(comment=null,task=null){openEditor({type:comment?'comment-edit':'comment-create',heading:comment?'تعديل الرد':'إضافة رد',showTitle:false,body:comment?.body||'',attachments:comment?.attachments||[],comment,task:task||state.tasks.find(item=>item.id===comment?.taskId)})}
async function saveEditor(){
  const config=state.editor;if(!config)return;const title=text(editorTitle.value),body=richTextFromEditor();const added=await filesToAttachments(editorFiles.files);const attachments=[...config.attachments,...added].slice(0,3);if(config.showTitle&&!title)return editorTitle.focus();if(!config.showTitle&&!body&&!attachments.length)return editorContent.focus();
  if(config.type==='task-create'){const parent=config.parent;const result=await post({action:'task_create',id:`task-${Date.now()}-${crypto.randomUUID()}`,parentType:parent?.kind||'none',parentId:parent?.id||'root-task-list',title,description:body,attachments});state.tasks.push({...result.task,kind:'task'});const maximum=Math.max(-1,...[...state.taskStates.values()].map(entry=>Number(entry.position)||0));state.taskStates.set(result.task.id,{taskId:result.task.id,status:'planned',position:maximum+1,deleted:false})}
  else if(config.type==='task-edit'){const result=await post({action:'task_update',taskId:config.task.id,title,description:body,attachments});Object.assign(config.task,result.task,{kind:'task'});if(state.current?.id===config.task.id){modalTitle.textContent=config.task.title;state.previewSources=previewSourcesFor(config.task);renderPreview()}}
  else if(config.type==='comment-create'){const result=await post({action:'task_comment',id:`comment-${Date.now()}-${crypto.randomUUID()}`,taskId:config.task.id,body,attachments});state.comments.push(result.comment)}
  else if(config.type==='comment-edit'){const result=await post({action:'task_comment_update',commentId:config.comment.id,body,attachments});Object.assign(config.comment,result.comment)}
  editorModal.close();state.editor=null;renderGrid();renderModalTasks()
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

async function readJson(url){const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});if(!response.ok)throw new Error(`read_failed_${response.status}`);return response.json()}
async function start(){
  const [ledger,payload]=await Promise.all([readJson(LEDGER_URL).catch(()=>({tasks:[]})),readJson(API_URL).catch(()=>({ok:false,tasks:[],taskStates:[],contentStates:[],taskComments:[],taskWork:[],messages:[]}))]);
  state.channelAvailable=Boolean(payload.ok);state.contentStates=new Map((payload.contentStates||[]).map(entry=>[entry.itemId,entry]));state.comments=payload.taskComments||[];state.work=payload.taskWork||[];state.content=contentItems();mergeTasks(ledger,payload);renderGrid();document.body.dataset.developerReady='true';
}

filters.addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;state.filter=button.dataset.filter;filters.querySelectorAll('[data-filter]').forEach(candidate=>candidate.classList.toggle('active',candidate===button));renderGrid()});
searchInput.addEventListener('input',()=>{state.query=searchInput.value;renderGrid()});
openGlobalTask.addEventListener('click',()=>openTaskEditor(null,null));
openLinkedTask.addEventListener('click',()=>{if(state.current?.kind!=='task')openTaskEditor(null,state.current)});
removeCurrent.addEventListener('click',()=>state.current?.kind==='task'?removeTask(state.current):removeContent(state.current));
document.querySelector('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close()});
modal.addEventListener('close',()=>{clearTimeout(state.previewTimer);state.previewFrame=null;mediaViewport.replaceChildren();state.current=null;state.previewSources=[]});
previewItemSelect.addEventListener('change',()=>{state.previewSourceIndex=Number(previewItemSelect.value);state.previewVersionIndex=0;renderPreview()});
previewVersionSelect.addEventListener('change',()=>{state.previewVersionIndex=Number(previewVersionSelect.value);renderPreview()});
document.querySelector('#editorClose').addEventListener('click',()=>editorModal.close());
document.querySelector('#editorCancel').addEventListener('click',()=>editorModal.close());
editorModal.addEventListener('click',event=>{if(event.target===editorModal)editorModal.close()});
editorForm.addEventListener('submit',async event=>{event.preventDefault();const save=document.querySelector('#editorSave');save.disabled=true;try{await saveEditor()}finally{save.disabled=false}});
document.querySelector('.editor-toolbar').addEventListener('click',event=>{const button=event.target.closest('[data-command]');if(!button)return;const command=button.dataset.command;if(command==='createLink'){const url=window.prompt('الرابط');if(!/^https?:\/\//i.test(url||''))return;document.execCommand(command,false,url)}else document.execCommand(command,false,null);editorContent.focus()});

start();
