import {developerDefinitions,definitionKey} from './developer-d2-registry.js?v=D2-workbench';

const REVIEW_API='./api/developer-d1';
const WORKSPACE_API='./api/developer-d1-workspace';
const COMPARISON_API='./api/developer-d1-comparisons';
const LOCAL_KEY='yakolak:developer-d2:state:v1';
const DRAWFLOW_VERSION='0.0.60';
const DRAWFLOW_JS=`https://cdn.jsdelivr.net/npm/drawflow@${DRAWFLOW_VERSION}/dist/drawflow.min.js`;
const DRAWFLOW_CSS=`https://cdn.jsdelivr.net/npm/drawflow@${DRAWFLOW_VERSION}/dist/drawflow.min.css`;
const STATUS={open:'جديدة',in_progress:'قيد التنفيذ',ready_for_review:'بانتظار قرارك',needs_changes:'تحتاج تعديل',approved:'معتمدة',rejected:'مرفوضة'};
const REQUEST_STATUS={requested:'طلب جديد',in_review:'قيد المراجعة',accepted:'مقبول',implemented:'تمت إضافته',rejected:'مرفوض'};
const ROLE={reviewer:'مراجعتي',developer:'رد المطور',system:'النظام'};
const $=selector=>document.querySelector(selector);
const app=$('#d2App');
const state={entities:[],threads:[],requests:[],comparisons:[],board:null,remote:false};
let selection={type:'entity',definition:developerDefinitions.find(item=>item.id==='clean-entry')||developerDefinitions[0]};
let navMode='content';
let requestKind='scene';
let compareOpen=false;
let whiteboard={editor:null,ready:false,saveTimer:0};

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const uuid=prefix=>`${prefix}:${crypto.randomUUID()}`;
const formatTime=value=>{try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}catch{return String(value||'')}};
const localRead=()=>{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}catch{return{}}};
const localSave=()=>{try{localStorage.setItem(LOCAL_KEY,JSON.stringify({...state,savedAt:new Date().toISOString()}))}catch{}};
const toast=text=>{const node=$('#d2Toast');node.textContent=text;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2200)};
const iconRefresh=()=>globalThis.lucide?.createIcons?.({attrs:{'stroke-width':1.8}});
const normalizeUrl=value=>{const text=String(value||'').trim();if(!text)return'';try{const url=new URL(text,location.href);return ['http:','https:'].includes(url.protocol)?url.toString():''}catch{return''}};
async function jsonFetch(url,options={}){const response=await fetch(url,{cache:'no-store',...options});if(!response.ok)throw new Error(`${url}_${response.status}`);const data=await response.json();if(!data?.ok)throw new Error(data?.error||'invalid_response');return data}
const post=(url,payload)=>jsonFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});

function entityRecord(definition){return state.entities.find(item=>item.entityType===definition.kind&&item.entityId===definition.id)||null}
function entityName(definition){return entityRecord(definition)?.displayName||definition.defaultName}
function threadsFor(definition){return state.threads.filter(item=>item.entityType===definition.kind&&item.entityId===definition.id).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
function latestComment(item){return [...(item.comments||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null}
function entityStatus(definition){const threads=threadsFor(definition);for(const status of['ready_for_review','needs_changes','in_progress','open'])if(threads.some(item=>item.status===status))return status;if(threads.length&&threads.every(item=>item.status==='approved'))return'approved';if(threads.some(item=>item.status==='rejected'))return'rejected';return''}
function previewUrl(definition){const url=new URL('./developer-scene.html',location.href);url.searchParams.set(definition.kind==='element'?'element':'scene',definition.id);url.searchParams.set('d','D2');return url.toString()}
function comparisonKey(definition){return`entity:${definition.kind}:${definition.id}`}
function comparisonFor(definition){return state.comparisons.find(item=>item.itemKey===comparisonKey(definition))||null}
function setSync(text,tone=''){const node=$('#d2SyncState');node.textContent=text;node.className=`d2-sync${tone?` ${tone}`:''}`}
function mobileView(view){app.dataset.mobileView=view;document.querySelectorAll('.d2-mobile-nav [data-mobile-view]').forEach(button=>button.classList.toggle('active',button.dataset.mobileView===view))}

function renderNavigator(){
  const list=$('#d2NavList'),query=$('#d2Search').value.trim().toLowerCase();list.innerHTML='';
  document.querySelectorAll('[data-nav-mode]').forEach(button=>{const active=button.dataset.navMode===navMode;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
  if(navMode==='content'){
    const filtered=developerDefinitions.filter(definition=>`${entityName(definition)} ${definition.description} ${definition.sourceKey}`.toLowerCase().includes(query));
    for(const [kind,label] of [['scene','المشاهد والرحلات'],['element','العناصر']]){
      const items=filtered.filter(item=>item.kind===kind);if(!items.length)continue;
      const title=document.createElement('div');title.className='d2-group-title';title.textContent=label;list.append(title);
      items.forEach(definition=>list.append(entityNavItem(definition)));
    }
    if(!filtered.length)list.innerHTML='<div class="d2-empty">لا توجد نتيجة مطابقة.</div>';
  }else{
    const items=reviewQueue().filter(item=>`${item.title} ${item.subtitle}`.toLowerCase().includes(query));
    if(!items.length){list.innerHTML='<div class="d2-empty">لا توجد عناصر مراجعة مطابقة.</div>';return}
    for(const item of items)list.append(queueNavItem(item));
  }
  iconRefresh();
}
function entityNavItem(definition){
  const button=document.createElement('button');button.type='button';button.className='d2-nav-item'+(selection.type==='entity'&&definitionKey(selection.definition)===definitionKey(definition)?' active':'');
  const status=entityStatus(definition);button.innerHTML=`<span class="d2-nav-mark">${esc(definition.mark)}</span><span class="d2-nav-copy"><strong>${esc(entityName(definition))}</strong><span>${esc(definition.label)} · ${esc(definition.description)}</span></span><span class="d2-nav-state ${esc(status)}" title="${esc(STATUS[status]||'بدون ملاحظات')}"></span>`;
  button.onclick=()=>selectEntity(definition);return button;
}
function reviewQueue(){
  const entries=[];
  state.threads.forEach(thread=>{if(['approved','rejected'].includes(thread.status))return;const definition=developerDefinitions.find(item=>item.kind===thread.entityType&&item.id===thread.entityId);if(!definition)return;entries.push({type:'thread',value:thread,title:entityName(definition),subtitle:latestComment(thread)?.body||thread.title||'ملاحظة',status:thread.status,updatedAt:thread.updatedAt,definition})});
  state.requests.forEach(request=>{if(['implemented','rejected'].includes(request.status))return;entries.push({type:'request',value:request,title:request.title,subtitle:request.description||'طلب تطوير',status:request.status,updatedAt:request.updatedAt})});
  const rank={ready_for_review:0,needs_changes:1,requested:2,in_review:3,accepted:4,in_progress:5,open:6};
  return entries.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function queueNavItem(item){
  const button=document.createElement('button');button.type='button';button.className='d2-nav-item';const mark=item.type==='request'?'＋':item.definition.mark;
  button.innerHTML=`<span class="d2-nav-mark">${esc(mark)}</span><span class="d2-nav-copy"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span></span><span class="d2-nav-state ${esc(item.status)}"></span>`;
  button.onclick=()=>item.type==='thread'?selectEntity(item.definition,{mobile:'inspector'}):selectRequest(item.value);return button;
}

function selectEntity(definition,{mobile='preview'}={}){
  selection={type:'entity',definition};compareOpen=false;$('#d2Compare').setAttribute('aria-pressed','false');$('#d2ComparePane').hidden=true;$('#d2LivePane').hidden=false;
  loadPreview();renderSelection();renderNavigator();mobileView(mobile);history.replaceState(null,'',`#${definition.kind}=${encodeURIComponent(definition.id)}`);
}
function selectRequest(request){selection={type:'request',request};compareOpen=false;$('#d2ComparePane').hidden=true;$('#d2LivePane').hidden=false;renderSelection();renderNavigator();mobileView('inspector')}
function loadPreview(){
  if(selection.type!=='entity')return;const frame=$('#d2PreviewFrame'),loading=$('#d2PreviewLoading');loading.innerHTML='<span class="d2-spinner"></span><strong>جارٍ تجهيز المعاينة</strong>';loading.classList.remove('hidden');frame.src=previewUrl(selection.definition);frame.onload=()=>loading.classList.add('hidden');
}
function renderSelection(){
  if(selection.type==='request'){renderRequestSelection();return}
  const definition=selection.definition,name=entityName(definition),threads=threadsFor(definition),status=entityStatus(definition);
  $('#d2SelectionKind').textContent=definition.label;$('#d2SelectionTitle').textContent=name;$('#d2SelectionCode').textContent=definition.sourceKey;$('#d2InspectorTitle').textContent=name;$('#d2ContextTitle').textContent='ملخص المشهد';$('#d2ContextDescription').textContent=definition.description;
  const pill=$('#d2ContextStatus');pill.textContent=STATUS[status]||'بدون ملاحظات';pill.className=`d2-status-pill ${status}`;
  $('#d2MobileReviewCount').textContent=threads.filter(item=>!['approved','rejected'].includes(item.status)).length;
  $('#d2Replay').disabled=false;$('#d2Compare').disabled=false;$('#d2Fullscreen').disabled=false;renderReviewInspector();renderComparisonInputs();
}
function renderRequestSelection(){
  const request=selection.request;$('#d2SelectionKind').textContent=request.kind==='scene'?'طلب مشهد':'طلب عنصر';$('#d2SelectionTitle').textContent=request.title;$('#d2SelectionCode').textContent=`request:${request.id}`;$('#d2InspectorTitle').textContent=request.title;$('#d2ContextTitle').textContent='تفاصيل الطلب';$('#d2ContextDescription').textContent=request.description||'لا يوجد وصف.';
  const pill=$('#d2ContextStatus');pill.textContent=REQUEST_STATUS[request.status]||request.status;pill.className=`d2-status-pill ${request.status}`;$('#d2MobileReviewCount').textContent=(request.comments||[]).length;
  $('#d2PreviewFrame').src='about:blank';$('#d2PreviewLoading').innerHTML='<i data-lucide="clipboard-list"></i><strong>هذا طلب تطوير وليس مشهدًا منشورًا بعد</strong>';$('#d2PreviewLoading').classList.remove('hidden');$('#d2Replay').disabled=true;$('#d2Compare').disabled=true;$('#d2Fullscreen').disabled=true;renderRequestInspector();iconRefresh();
}

function renderReviewInspector(){
  const definition=selection.definition,threads=threadsFor(definition),active=threads.filter(item=>!['approved','rejected'].includes(item.status));
  $('#d2ReviewSummary').innerHTML=`<span class="d2-review-chip">${threads.length} إجمالي</span><span class="d2-review-chip">${active.length} نشطة</span><span class="d2-review-chip">${threads.filter(item=>item.status==='ready_for_review').length} بانتظارك</span><span class="d2-review-chip">${threads.filter(item=>item.status==='approved').length} معتمدة</span>`;
  $('.d2-new-note').hidden=false;const root=$('#d2ThreadList');root.innerHTML='';
  if(!threads.length){root.innerHTML='<div class="d2-empty">لا توجد ملاحظات. أضف ملاحظة محددة مرتبطة بما تراه في المعاينة.</div>';return}
  threads.forEach(thread=>root.append(threadNode(thread)));iconRefresh();
}
function threadNode(thread){
  const article=document.createElement('article');article.className='d2-thread';article.dataset.threadId=thread.id;const latest=latestComment(thread);const all=(thread.comments||[]).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  article.innerHTML=`<header><div class="d2-thread-title"><strong>${esc(thread.title||all[0]?.body?.split('\n')[0]?.slice(0,90)||'ملاحظة')}</strong><span>${esc(formatTime(thread.updatedAt))} · ${all.length} تعليقات</span></div><span class="d2-thread-badge ${esc(thread.status)}">${esc(STATUS[thread.status]||thread.status)}</span></header>${latest?`<div class="d2-comments"><article class="d2-comment ${esc(latest.authorRole||'reviewer')}"><header><span>${esc(ROLE[latest.authorRole]||latest.authorRole)}</span><time>${esc(formatTime(latest.createdAt))}</time></header><p>${esc(latest.body)}</p></article></div>`:''}<details><summary>عرض السجل الكامل</summary><div class="d2-comments">${all.map(commentHtml).join('')}</div></details><section class="d2-thread-compose"><textarea maxlength="12000" placeholder="اكتب تعقيبًا أو ردًا…"></textarea><div class="d2-thread-actions"><button class="d2-action dark" data-action="reply-reviewer">تعقيبي</button><button class="d2-action" data-action="reply-developer">رد المطور</button><button class="d2-action" data-action="in_progress">جاري التنفيذ</button><button class="d2-action" data-action="ready_for_review">جاهز للمراجعة</button><button class="d2-action approve" data-action="approved">اعتماد</button><button class="d2-action changes" data-action="needs_changes">تحتاج تعديل</button><button class="d2-action reject" data-action="rejected">رفض</button></div></section>`;
  article.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>threadAction(article,button.dataset.action));return article;
}
function commentHtml(comment){return`<article class="d2-comment ${esc(comment.authorRole||'reviewer')}"><header><span>${esc(ROLE[comment.authorRole]||comment.authorRole)}</span><time>${esc(formatTime(comment.createdAt))}</time></header><p>${esc(comment.body)}</p></article>`}
async function addNote(){
  if(selection.type!=='entity')return;const input=$('#d2NewNote'),body=input.value.trim();if(!body){input.focus();return}
  const definition=selection.definition;try{const data=await post(REVIEW_API,{action:'create_thread',threadId:uuid('thread'),commentId:uuid('comment'),entityType:definition.kind,entityId:definition.id,authorRole:'reviewer',body});replaceThread(data.thread);input.value='';toast('تمت إضافة الملاحظة')}catch(error){console.error(error);toast('تعذر حفظ الملاحظة')}
}
async function threadAction(card,action){
  const threadId=card.dataset.threadId,input=card.querySelector('textarea'),text=input.value.trim();let payload;
  if(action.startsWith('reply-')){if(!text){input.focus();return}const authorRole=action==='reply-developer'?'developer':'reviewer';payload={action:'add_comment',threadId,commentId:uuid('comment'),authorRole,kind:authorRole==='developer'?'implementation':'reply',body:text}}
  else{if(action==='needs_changes'&&!text){input.placeholder='اكتب التعديل المطلوب أولًا';input.focus();return}const defaults={in_progress:'بدأ المطور معالجة هذه الملاحظة.',ready_for_review:'اكتمل التغيير وأصبح جاهزًا لمراجعتك.',approved:'تمت مراجعة التغيير واعتماده.',rejected:'تم رفض التغيير في صورته الحالية.'};payload={action:'set_status',threadId,status:action,commentId:uuid('comment'),authorRole:['in_progress','ready_for_review'].includes(action)?'developer':'reviewer',body:text||defaults[action]||''}}
  try{const data=await post(REVIEW_API,payload);replaceThread(data.thread);toast('تم حفظ التحديث')}catch(error){console.error(error);toast('تعذر حفظ التحديث')}
}
function replaceThread(thread){const index=state.threads.findIndex(item=>item.id===thread.id);if(index>=0)state.threads[index]=thread;else state.threads.unshift(thread);localSave();renderSelection();renderNavigator();updateQueueCount()}

function renderRequestInspector(){
  const request=selection.request,comments=(request.comments||[]).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  $('#d2ReviewSummary').innerHTML=`<span class="d2-review-chip">${esc(REQUEST_STATUS[request.status]||request.status)}</span><span class="d2-review-chip">${comments.length} تعليقات</span>`;$('.d2-new-note').hidden=true;
  const root=$('#d2ThreadList');root.innerHTML=`<article class="d2-thread" data-request-id="${esc(request.id)}"><header><div class="d2-thread-title"><strong>${esc(request.title)}</strong><span>${esc(request.kind==='scene'?'طلب مشهد':'طلب عنصر')} · ${esc(formatTime(request.updatedAt))}</span></div><span class="d2-thread-badge ${esc(request.status)}">${esc(REQUEST_STATUS[request.status]||request.status)}</span></header><div class="d2-comments"><article class="d2-comment"><header><span>تفاصيل الطلب</span></header><p>${esc(request.description||'لا يوجد وصف')}${request.scenario?`\n\nمكانه في الرحلة: ${esc(request.scenario)}`:''}</p></article>${comments.map(commentHtml).join('')}</div><section class="d2-thread-compose"><textarea maxlength="12000" placeholder="اكتب تعقيبًا على الطلب…"></textarea><div class="d2-thread-actions"><button class="d2-action dark" data-request-action="reply-reviewer">تعقيبي</button><button class="d2-action" data-request-action="reply-developer">رد المطور</button><button class="d2-action" data-request-action="in_review">قيد المراجعة</button><button class="d2-action approve" data-request-action="accepted">قبول</button><button class="d2-action approve" data-request-action="implemented">تمت إضافته</button><button class="d2-action reject" data-request-action="rejected">رفض</button></div></section></article>`;
  root.querySelectorAll('[data-request-action]').forEach(button=>button.onclick=()=>requestAction(root.querySelector('[data-request-id]'),button.dataset.requestAction));
}
async function requestAction(card,action){
  const requestId=Number(card.dataset.requestId),input=card.querySelector('textarea'),body=input.value.trim();try{let data;if(action.startsWith('reply-')){if(!body){input.focus();return}data=await post(WORKSPACE_API,{action:'request_comment',requestId,commentId:uuid('request-comment'),authorRole:action==='reply-developer'?'developer':'reviewer',body})}else data=await post(WORKSPACE_API,{action:'request_status',requestId,status:action});replaceRequest(data.request);toast('تم تحديث الطلب')}catch(error){console.error(error);toast('تعذر تحديث الطلب')}
}
function replaceRequest(request){const index=state.requests.findIndex(item=>Number(item.id)===Number(request.id));if(index>=0)state.requests[index]=request;else state.requests.unshift(request);if(selection.type==='request'&&Number(selection.request.id)===Number(request.id))selection.request=request;localSave();renderSelection();renderNavigator();updateQueueCount()}

function updateQueueCount(){const count=reviewQueue().length;$('#d2QueueCount').textContent=count;$('#d2QueueCount').hidden=!count}
function renderComparisonInputs(){
  if(selection.type!=='entity')return;const saved=comparisonFor(selection.definition),current=previewUrl(selection.definition);$('#d2BeforeUrl').value=saved?.beforeUrl||'';$('#d2AfterUrl').value=saved?.afterUrl||current;$('#d2CompareState').textContent=state.remote?'الحفظ مشترك':'الحفظ المحلي متاح';if(compareOpen)loadComparisonFrames();
}
function loadFrame(frame,empty,url){const normalized=normalizeUrl(url);empty.hidden=Boolean(normalized);frame.src=normalized||'about:blank'}
function loadComparisonFrames(){loadFrame($('#d2BeforeFrame'),$('#d2BeforeEmpty'),$('#d2BeforeUrl').value);loadFrame($('#d2AfterFrame'),$('#d2AfterEmpty'),$('#d2AfterUrl').value)}
function toggleCompare(){if(selection.type!=='entity')return;compareOpen=!compareOpen;$('#d2Compare').setAttribute('aria-pressed',String(compareOpen));$('#d2ComparePane').hidden=!compareOpen;$('#d2LivePane').hidden=compareOpen;if(compareOpen)loadComparisonFrames()}
async function saveComparison(){
  if(selection.type!=='entity')return;const definition=selection.definition,comparison={itemKey:comparisonKey(definition),itemKind:'entity',beforeUrl:normalizeUrl($('#d2BeforeUrl').value),afterUrl:normalizeUrl($('#d2AfterUrl').value),updatedAt:new Date().toISOString()};
  const existing=state.comparisons.findIndex(item=>item.itemKey===comparison.itemKey);if(existing>=0)state.comparisons[existing]=comparison;else state.comparisons.push(comparison);localSave();$('#d2CompareState').textContent='جارٍ الحفظ…';
  try{const data=await post(COMPARISON_API,{action:'save',...comparison});const index=state.comparisons.findIndex(item=>item.itemKey===comparison.itemKey);state.comparisons[index]=data.comparison;state.remote=true;localSave();$('#d2CompareState').textContent='تم حفظ المقارنة للجميع';toast('تم حفظ المقارنة')}catch(error){console.warn(error);$('#d2CompareState').textContent='حُفظت محليًا؛ تعذر الحفظ المشترك';toast('حُفظت المقارنة محليًا')}
}

function openRequestModal(){requestKind='scene';document.querySelectorAll('[data-request-kind]').forEach(button=>button.classList.toggle('active',button.dataset.requestKind==='scene'));$('#d2RequestForm').reset();$('#d2ModalScrim').hidden=false;$('#d2RequestModal').hidden=false;requestAnimationFrame(()=>$('#d2RequestName').focus())}
function closeRequestModal(){$('#d2ModalScrim').hidden=true;$('#d2RequestModal').hidden=true}
async function submitRequest(event){event.preventDefault();const title=$('#d2RequestName').value.trim();if(!title)return;try{const data=await post(WORKSPACE_API,{action:'request_create',kind:requestKind,title,description:$('#d2RequestDescription').value.trim(),scenario:$('#d2RequestScenario').value.trim()});replaceRequest(data.request);closeRequestModal();navMode='queue';renderNavigator();selectRequest(data.request);toast('تم حفظ الطلب')}catch(error){console.error(error);toast('تعذر حفظ الطلب')}}

function utilityOpen(kind){
  const overlay=$('#d2UtilityOverlay'),frame=$('#d2UtilityFrame');overlay.hidden=false;document.body.dataset.utility=kind;
  if(kind==='game'){$('#d2UtilityKicker').textContent='Production Preview';$('#d2UtilityTitle').textContent='اللعبة المنشورة دون أدوات المطور';frame.src=new URL('./',location.href).toString()}
  else{$('#d2UtilityKicker').textContent='Visual Flow';$('#d2UtilityTitle').textContent='مخطط المشاهد والسيناريوهات';frame.src='about:blank';buildBoardDocument(frame)}
}
function utilityClose(){$('#d2UtilityOverlay').hidden=true;$('#d2UtilityFrame').src='about:blank'}
function utilityReload(){const frame=$('#d2UtilityFrame');if(document.body.dataset.utility==='game')frame.src=frame.src;else buildBoardDocument(frame)}
function buildBoardDocument(frame){
  const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${DRAWFLOW_CSS}"><style>*{box-sizing:border-box}html,body,#canvas{margin:0;width:100%;height:100%;overflow:hidden;font-family:system-ui;background:#faf9f5 radial-gradient(#ccc 1px,transparent 1px);background-size:22px 22px}.tools{position:fixed;z-index:10;top:12px;right:12px;display:flex;gap:6px;padding:6px;border:1px solid #ddd;border-radius:12px;background:#fff}.tools button{border:0;border-radius:8px;background:#eee;padding:8px 10px;font-weight:800}.drawflow .drawflow-node{width:250px;border:1px solid #ccc;border-radius:16px;background:#fff}.drawflow .connection .main-path{stroke:#5f5a53;stroke-width:4px}.node{direction:rtl;width:220px}.node em{font-size:9px}.node strong{display:block;margin-top:7px}.node textarea{width:100%;min-height:55px;margin-top:8px;border:1px solid #ddd;border-radius:8px;padding:7px}</style></head><body><div class="tools"><button id="add">＋ سيناريو</button><button id="save">حفظ</button><button id="out">−</button><button id="reset">100%</button><button id="in">＋</button></div><div id="canvas"></div><script src="${DRAWFLOW_JS}"><\/script></body></html>`);doc.close();
  const start=()=>{if(!frame.contentWindow.Drawflow){setTimeout(start,60);return}const Editor=frame.contentWindow.Drawflow,editor=new Editor(doc.getElementById('canvas'));editor.reroute=true;editor.start();whiteboard.editor=editor;const existing=state.board;if(existing?.drawflow)editor.import(existing);else developerDefinitions.filter(item=>item.kind==='scene').forEach((definition,index)=>editor.addNode(`scene-${definition.id}`,1,1,60+(index%3)*310,80+Math.floor(index/3)*220,'scene-node',{kind:'scene',sceneId:definition.id,note:''},`<div class="node"><em>مشهد</em><strong>${esc(entityName(definition))}</strong><textarea df-note placeholder="ملاحظات الانتقال…"></textarea></div>`));doc.getElementById('add').onclick=()=>editor.addNode(`scenario-${Date.now()}`,1,1,120,120,'scenario-node',{kind:'scenario'},'<div class="node"><em>سيناريو</em><strong>سيناريو جديد</strong><textarea df-note></textarea></div>');doc.getElementById('out').onclick=()=>editor.zoom_out();doc.getElementById('reset').onclick=()=>editor.zoom_reset();doc.getElementById('in').onclick=()=>editor.zoom_in();doc.getElementById('save').onclick=()=>saveBoard(editor);whiteboard.ready=true};start();
}
async function saveBoard(editor){state.board=editor.export();localSave();const data=state.board.drawflow?.Home?.data||{},nodeCount=Object.keys(data).length,connectionCount=Object.values(data).reduce((sum,node)=>sum+Object.values(node.outputs||{}).reduce((inner,output)=>inner+(output.connections?.length||0),0),0);try{const saved=await post(WORKSPACE_API,{action:'board_save',board:state.board,nodeCount,connectionCount});state.board=saved.workspace.board;localSave();toast('تم حفظ المخطط المشترك')}catch(error){console.warn(error);toast('حُفظ المخطط محليًا')}
}

async function loadAll(){
  setSync('جارٍ المزامنة…');const local=localRead();for(const key of['entities','threads','requests','comparisons','board'])if(local[key])state[key]=local[key];renderAll();
  try{const [reviews,workspace,comparisons]=await Promise.all([jsonFetch(REVIEW_API),jsonFetch(WORKSPACE_API),jsonFetch(COMPARISON_API)]);state.entities=reviews.entities||[];state.threads=reviews.threads||[];state.requests=workspace.requests||[];state.board=workspace.board||state.board;state.comparisons=comparisons.comparisons||[];state.remote=true;localSave();setSync('متصل بالمخزن المشترك','ok')}catch(error){console.warn('[Yakolak] D2 local fallback',error);setSync('عرض محلي؛ تعذر الاتصال','warn')}
  renderAll();document.body.dataset.developerBuild='D2-workbench';
}
function renderAll(){updateQueueCount();renderNavigator();renderSelection();iconRefresh()}
function restoreHash(){const match=location.hash.match(/^#(scene|element)=([^&]+)/);if(!match)return;const definition=developerDefinitions.find(item=>item.kind===match[1]&&item.id===decodeURIComponent(match[2]));if(definition)selection={type:'entity',definition}}
function bind(){
  document.querySelectorAll('[data-nav-mode]').forEach(button=>button.onclick=()=>{navMode=button.dataset.navMode;renderNavigator()});$('#d2Search').oninput=renderNavigator;$('#d2Refresh').onclick=loadAll;
  $('#d2Replay').onclick=()=>{if(selection.type==='entity')loadPreview()};$('#d2Compare').onclick=toggleCompare;$('#d2Fullscreen').onclick=()=>$('#d2PreviewArea').requestFullscreen?.();$('#d2UseCurrent').onclick=()=>{if(selection.type==='entity'){$('#d2AfterUrl').value=previewUrl(selection.definition);loadComparisonFrames()}};$('#d2SaveCompare').onclick=saveComparison;$('#d2BeforeUrl').onchange=loadComparisonFrames;$('#d2AfterUrl').onchange=loadComparisonFrames;
  $('#d2AddNote').onclick=addNote;$('#d2NewNote').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();addNote()}});
  $('#d2NewRequest').onclick=openRequestModal;document.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=closeRequestModal);$('#d2ModalScrim').onclick=closeRequestModal;document.querySelectorAll('[data-request-kind]').forEach(button=>button.onclick=()=>{requestKind=button.dataset.requestKind;document.querySelectorAll('[data-request-kind]').forEach(item=>item.classList.toggle('active',item===button))});$('#d2RequestForm').onsubmit=submitRequest;
  $('#d2GameOpen').onclick=()=>utilityOpen('game');$('#d2FlowOpen').onclick=()=>utilityOpen('flow');$('#d2UtilityClose').onclick=utilityClose;$('#d2UtilityReload').onclick=utilityReload;
  document.querySelectorAll('.d2-mobile-nav [data-mobile-view]').forEach(button=>button.onclick=()=>mobileView(button.dataset.mobileView));$('#d2NavToggle').onclick=()=>mobileView('navigator');$('#d2InspectorClose').onclick=()=>mobileView('preview');
  addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#d2RequestModal').hidden)closeRequestModal();else if(!$('#d2UtilityOverlay').hidden)utilityClose();else mobileView('preview')}if(event.target.matches('input,textarea'))return;if(event.key.toLowerCase()==='r'&&selection.type==='entity')loadPreview();if(event.key.toLowerCase()==='c'&&selection.type==='entity')toggleCompare();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();mobileView('navigator');$('#d2Search').focus()}});
}

restoreHash();bind();loadPreview();renderAll();loadAll();
