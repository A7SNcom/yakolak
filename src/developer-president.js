const API_URL='./api/developer-president';
const STATUS_LABEL={planned:'جديدة',in_progress:'قيد التنفيذ',review:'للمراجعة',done:'مكتملة'};
const STATUS_ORDER=['planned','in_progress','review','done'];
const PARENT_LABEL={none:'عام',scene:'مشهد',journey:'رحلة',element:'عنصر'};
const state={tasks:[],taskStates:new Map(),comments:[],work:[],filter:'all',query:'',current:null,writable:false,sheetUrl:'',feed:'conversation',editing:null};

const taskList=document.querySelector('#taskList');
const searchInput=document.querySelector('#searchInput');
const newTaskButton=document.querySelector('#newTaskButton');
const refreshButton=document.querySelector('#refreshButton');
const sheetLink=document.querySelector('#sheetLink');
const connectionText=document.querySelector('#connectionText');
const readOnlyNotice=document.querySelector('#readOnlyNotice');
const taskDialog=document.querySelector('#taskDialog');
const taskTitle=document.querySelector('#taskTitle');
const taskStatus=document.querySelector('#taskStatus');
const taskOwner=document.querySelector('#taskOwner');
const taskDescription=document.querySelector('#taskDescription');
const taskContext=document.querySelector('#taskContext');
const taskFeed=document.querySelector('#taskFeed');
const commentForm=document.querySelector('#commentForm');
const commentInput=document.querySelector('#commentInput');
const editTaskButton=document.querySelector('#editTaskButton');
const deleteTaskButton=document.querySelector('#deleteTaskButton');
const editorDialog=document.querySelector('#editorDialog');
const editorForm=document.querySelector('#editorForm');
const editorHeading=document.querySelector('#editorHeading');
const editorTitle=document.querySelector('#editorTitle');
const editorDescription=document.querySelector('#editorDescription');
const editorOwner=document.querySelector('#editorOwner');
const editorParentType=document.querySelector('#editorParentType');
const editorParentId=document.querySelector('#editorParentId');
const parentIdField=document.querySelector('#parentIdField');
const toast=document.querySelector('#toast');

const clean=value=>String(value??'').trim();
const taskState=id=>state.taskStates.get(id)||{taskId:id,status:'planned',position:Number.MAX_SAFE_INTEGER,deleted:false};
const currentTasks=()=>state.tasks.filter(task=>!taskState(task.id).deleted).sort((a,b)=>taskState(a.id).position-taskState(b.id).position||a.title.localeCompare(b.title,'ar'));
function showToast(message){toast.textContent=message;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.hidden=true,2600)}
function formatDate(value){if(!value)return'';const date=new Date(value);return Number.isNaN(date.valueOf())?'':new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(date)}
function escapeSearch(value){return clean(value).toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')}
function taskMatches(task){const query=escapeSearch(state.query);if(!query)return true;return escapeSearch([task.title,task.description,task.owner,task.parentId].join(' ')).includes(query)}
function filteredTasks(){return currentTasks().filter(task=>(state.filter==='all'||taskState(task.id).status===state.filter)&&taskMatches(task))}
function fillStatusSelect(select,status){select.replaceChildren(...STATUS_ORDER.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=STATUS_LABEL[value];option.selected=value===status;return option}))}

function updateSummary(){
  const tasks=currentTasks();
  document.querySelector('#countAll').textContent=tasks.length;
  document.querySelector('#countProgress').textContent=tasks.filter(task=>taskState(task.id).status==='in_progress').length;
  document.querySelector('#countReview').textContent=tasks.filter(task=>taskState(task.id).status==='review').length;
  document.querySelector('#countDone').textContent=tasks.filter(task=>taskState(task.id).status==='done').length;
}
function createTaskRow(task){
  const row=document.createElement('article');row.className='task-row';row.tabIndex=0;row.dataset.taskId=task.id;
  const main=document.createElement('div');main.className='task-main';
  const title=document.createElement('strong');title.textContent=task.title;
  const subline=document.createElement('div');subline.className='task-subline';
  const owner=document.createElement('span');owner.textContent=task.owner?`المسؤول: ${task.owner}`:'بدون مسؤول';
  const context=document.createElement('span');context.textContent=task.parentType&&task.parentType!=='none'?`${PARENT_LABEL[task.parentType]||task.parentType}: ${task.parentId}`:'عام';
  subline.append(owner,context);main.append(title,subline);
  const status=document.createElement('span');const value=taskState(task.id).status;status.className=`status-pill status-${value}`;status.textContent=STATUS_LABEL[value]||value;
  row.append(main,status);row.addEventListener('click',()=>openTask(task));row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openTask(task)}});return row;
}
function renderTasks(){
  taskList.replaceChildren();const tasks=filteredTasks();
  if(!tasks.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=state.query?'لا توجد نتائج':'لا توجد مهام بعد';taskList.append(empty)}else taskList.append(...tasks.map(createTaskRow));
  updateSummary();
}
function commentsFor(taskId){return state.comments.filter(entry=>entry.taskId===taskId)}
function workFor(taskId){return state.work.filter(entry=>entry.taskId===taskId)}
function createFeedItem(entry,type){
  const article=document.createElement('article');article.className=`feed-item ${type==='work'?(entry.authorRole==='manager'?'manager':'worker'):(entry.authorRole==='manager'?'manager':'')}`;
  const header=document.createElement('header');const author=document.createElement('strong');author.textContent=type==='work'?(entry.authorRole==='manager'?'راشد':entry.authorName):(entry.authorRole==='manager'?'راشد':'أحمد');const time=document.createElement('time');time.textContent=formatDate(entry.createdAt);header.append(author,time);
  const body=document.createElement('p');body.textContent=entry.body;article.append(header,body);return article;
}
function renderFeed(){
  taskFeed.replaceChildren();if(!state.current)return;
  const entries=state.feed==='conversation'?commentsFor(state.current.id):workFor(state.current.id);
  if(!entries.length){const empty=document.createElement('p');empty.className='feed-empty';empty.textContent=state.feed==='conversation'?'لا توجد محادثة بعد':'لا يوجد عمل مسجل';taskFeed.append(empty)}else taskFeed.append(...entries.map(entry=>createFeedItem(entry,state.feed==='conversation'?'comment':'work')));
  commentForm.hidden=state.feed!=='conversation'||!state.writable;
}
function openTask(task){
  state.current=task;state.feed='conversation';taskTitle.textContent=task.title;taskOwner.value=task.owner||'';taskDescription.textContent=task.description||'لا توجد تفاصيل';fillStatusSelect(taskStatus,taskState(task.id).status);
  const linked=task.parentType&&task.parentType!=='none';taskContext.hidden=!linked;taskContext.textContent=linked?`مرتبط بـ ${PARENT_LABEL[task.parentType]||task.parentType}: ${task.parentId}`:'';
  document.querySelectorAll('[data-feed]').forEach(button=>button.classList.toggle('active',button.dataset.feed==='conversation'));
  taskStatus.disabled=!state.writable;editTaskButton.disabled=!state.writable;deleteTaskButton.disabled=!state.writable;renderFeed();taskDialog.showModal();
}
function openEditor(task=null){
  state.editing=task;editorHeading.textContent=task?'تعديل المهمة':'مهمة جديدة';editorTitle.value=task?.title||'';editorDescription.value=task?.description||'';editorOwner.value=task?.owner||'';editorParentType.value=task?.parentType||'none';editorParentId.value=task?.parentId==='root-task-list'?'':task?.parentId||'';toggleParentId();editorDialog.showModal();setTimeout(()=>editorTitle.focus(),0);
}
function toggleParentId(){parentIdField.hidden=editorParentType.value==='none'}
async function apiPost(payload){
  const response=await fetch(API_URL,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({}));
  if(!response.ok){const message=result.error==='google_sheets_store_error'?'تعذر الكتابة في قوقل شيت':result.error==='president_approval_required'?'اعتماد الإكمال من أحمد فقط':result.error||'تعذر الحفظ';throw new Error(message)}return result;
}
async function load(){
  refreshButton.disabled=true;connectionText.textContent='جاري الاتصال';
  try{
    const response=await fetch(API_URL,{headers:{accept:'application/json'},cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(payload.error||'تعذر الاتصال');
    state.tasks=(payload.tasks||[]).map(task=>({...task,kind:'task'}));state.taskStates=new Map((payload.taskStates||[]).map(entry=>[entry.taskId,entry]));state.comments=payload.taskComments||[];state.work=payload.taskWork||[];state.writable=Boolean(payload.writable);state.sheetUrl=payload.sheetUrl||sheetLink.href;
    sheetLink.href=state.sheetUrl;connectionText.textContent=state.writable?'متصل بقوقل شيت':'متصل للقراءة';readOnlyNotice.hidden=state.writable;newTaskButton.disabled=!state.writable;renderTasks();document.body.dataset.developerReady='true';
  }catch(error){connectionText.textContent='تعذر الاتصال';taskList.innerHTML='<p class="empty">تعذر قراءة قاعدة البيانات</p>';showToast(error.message)}finally{refreshButton.disabled=false}
}

searchInput.addEventListener('input',()=>{state.query=searchInput.value;renderTasks()});
document.querySelector('.summary').addEventListener('click',event=>{const button=event.target.closest('[data-status]');if(!button)return;state.filter=button.dataset.status;document.querySelectorAll('[data-status]').forEach(item=>item.classList.toggle('active',item===button));renderTasks()});
refreshButton.addEventListener('click',load);newTaskButton.addEventListener('click',()=>openEditor());
document.querySelector('#closeTaskDialog').addEventListener('click',()=>taskDialog.close());taskDialog.addEventListener('click',event=>{if(event.target===taskDialog)taskDialog.close()});
document.querySelector('#closeEditorDialog').addEventListener('click',()=>editorDialog.close());document.querySelector('#cancelEditor').addEventListener('click',()=>editorDialog.close());editorDialog.addEventListener('click',event=>{if(event.target===editorDialog)editorDialog.close()});
editorParentType.addEventListener('change',toggleParentId);
document.querySelector('.feed-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-feed]');if(!button)return;state.feed=button.dataset.feed;document.querySelectorAll('[data-feed]').forEach(item=>item.classList.toggle('active',item===button));renderFeed()});
editTaskButton.addEventListener('click',()=>{if(state.current)openEditor(state.current)});
deleteTaskButton.addEventListener('click',async()=>{if(!state.current||!confirm('حذف المهمة؟'))return;try{const result=await apiPost({action:'task_delete',taskId:state.current.id});state.taskStates.set(state.current.id,{...taskState(state.current.id),...result.taskState});taskDialog.close();renderTasks();showToast('تم الحذف')}catch(error){showToast(error.message)}});
taskStatus.addEventListener('change',async()=>{if(!state.current)return;const previous=taskState(state.current.id).status;try{const result=await apiPost({action:'task_status',taskId:state.current.id,status:taskStatus.value});if(taskStatus.value==='in_progress')for(const [id,entry]of state.taskStates)if(id!==state.current.id&&entry.status==='in_progress')state.taskStates.set(id,{...entry,status:'planned'});state.taskStates.set(state.current.id,result.taskState);renderTasks();showToast('تم تحديث الحالة')}catch(error){taskStatus.value=previous;showToast(error.message)}});
commentForm.addEventListener('submit',async event=>{event.preventDefault();if(!state.current||!clean(commentInput.value))return;const button=commentForm.querySelector('button');button.disabled=true;try{const result=await apiPost({action:'task_comment',id:`comment-${Date.now()}-${crypto.randomUUID()}`,taskId:state.current.id,body:clean(commentInput.value)});state.comments.push(result.comment);commentInput.value='';renderFeed();showToast('تم إرسال الرد')}catch(error){showToast(error.message)}finally{button.disabled=false}});
editorForm.addEventListener('submit',async event=>{event.preventDefault();const title=clean(editorTitle.value);if(!title)return;const save=document.querySelector('#saveEditor');save.disabled=true;try{const parentType=editorParentType.value,parentId=parentType==='none'?'root-task-list':clean(editorParentId.value)||'root-task-list';if(state.editing){const result=await apiPost({action:'task_update',taskId:state.editing.id,title,description:clean(editorDescription.value),owner:clean(editorOwner.value),parentType,parentId});Object.assign(state.editing,result.task,{kind:'task'});if(state.current?.id===state.editing.id){state.current=state.editing;taskDialog.close()}}else{const result=await apiPost({action:'task_create',id:`task-${Date.now()}-${crypto.randomUUID()}`,title,description:clean(editorDescription.value),owner:clean(editorOwner.value),parentType,parentId});state.tasks.push({...result.task,kind:'task'});state.taskStates.set(result.task.id,{taskId:result.task.id,status:'planned',position:state.tasks.length-1,deleted:false,updatedAt:result.task.updatedAt})}editorDialog.close();state.editing=null;renderTasks();showToast('تم الحفظ')}catch(error){showToast(error.message)}finally{save.disabled=false}});

load();
