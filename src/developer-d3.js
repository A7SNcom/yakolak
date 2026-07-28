import {developerDefinitions,definitionKey} from './developer-d2-registry.js?v=D3-task-workspace';

const REVIEW_API='./api/developer-d1';
const WORKSPACE_API='./api/developer-d1-workspace';
const COMPARISON_API='./api/developer-d1-comparisons';
const LOCAL_KEY='yakolak:developer-d3:state:v1';
const STATUS={open:'جديدة',in_progress:'قيد التنفيذ',ready_for_review:'بانتظار قرارك',needs_changes:'تحتاج تعديل',approved:'معتمدة',rejected:'مرفوضة'};
const REQUEST_STATUS={requested:'طلب جديد',in_review:'قيد المراجعة',accepted:'مقبول',implemented:'تمت إضافته',rejected:'مرفوض'};
const ROLE={reviewer:'ملاحظتك',developer:'رد المطور',system:'النظام'};
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const state={entities:[],threads:[],requests:[],comparisons:[],board:null,remote:false};
let selection={type:'entity',definition:developerDefinitions.find(item=>item.id==='clean-entry')||developerDefinitions[0]};
let filter='all';
let drawerTab='task';
let requestKind='scene';
let compareOpen=false;

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const uuid=prefix=>`${prefix}:${crypto.randomUUID()}`;
const formatTime=value=>{try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}catch{return String(value||'')}};
const normalizeUrl=value=>{const text=String(value||'').trim();if(!text)return'';try{const url=new URL(text,document.baseURI);return ['http:','https:'].includes(url.protocol)?url.toString():''}catch{return''}};
const localRead=()=>{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}catch{return{}}};
const localSave=()=>{try{localStorage.setItem(LOCAL_KEY,JSON.stringify({...state,savedAt:new Date().toISOString()}))}catch{}};
const post=(url,payload)=>jsonFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
async function jsonFetch(url,options={}){const response=await fetch(url,{cache:'no-store',...options});if(!response.ok)throw new Error(`${url}_${response.status}`);const data=await response.json();if(!data?.ok)throw new Error(data?.error||'invalid_response');return data}
function toast(text){const node=$('#d3Toast');node.textContent=text;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2200)}
function setSync(text,tone=''){state.remote=tone==='ok'||state.remote;$('#d3SyncText').textContent=text;$('#d3SyncDot').className=`d3-sync-dot${tone?` ${tone}`:''}`}
function entityRecord(definition){return state.entities.find(item=>item.entityType===definition.kind&&item.entityId===definition.id)||null}
function entityName(definition){return entityRecord(definition)?.displayName||definition.defaultName}
function threadsFor(definition){return state.threads.filter(item=>item.entityType===definition.kind&&item.entityId===definition.id).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))}
function latestComment(item){return [...(item.comments||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null}
function entityStatus(definition){const threads=threadsFor(definition);for(const status of['ready_for_review','needs_changes','in_progress','open'])if(threads.some(item=>item.status===status))return status;if(threads.length&&threads.every(item=>item.status==='approved'))return'approved';if(threads.some(item=>item.status==='rejected'))return'rejected';return''}
function previewUrl(definition){const url=new URL('./developer-scene.html',document.baseURI);url.searchParams.set(definition.kind==='element'?'element':'scene',definition.id);url.searchParams.set('d','D3');return url.toString()}
function comparisonKey(definition){return`entity:${definition.kind}:${definition.id}`}
function comparisonFor(definition){return state.comparisons.find(item=>item.itemKey===comparisonKey(definition))||null}
function activeQueue(){
  const items=[];
  state.threads.forEach(thread=>{if(['approved','rejected'].includes(thread.status))return;const definition=developerDefinitions.find(item=>item.kind===thread.entityType&&item.id===thread.entityId);if(!definition)return;items.push({type:'thread',status:thread.status,updatedAt:thread.updatedAt,title:entityName(definition),subtitle:latestComment(thread)?.body||thread.title||'ملاحظة',definition,value:thread})});
  state.requests.forEach(request=>{if(['implemented','rejected'].includes(request.status))return;items.push({type:'request',status:request.status,updatedAt:request.updatedAt,title:request.title,subtitle:request.description||'طلب تطوير',value:request})});
  const rank={ready_for_review:0,needs_changes:1,requested:2,in_review:3,accepted:4,in_progress:5,open:6};
  return items.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function mobileView(view){$('#d3App').dataset.mobileView=view;$$('[data-mobile-view]').forEach(button=>button.classList.toggle('active',button.dataset.mobileView===view));if(view==='work')openDrawer('review');if(view==='content')closeDrawer()}

function renderNavigator(){
  const root=$('#d3NavList'),query=$('#d3Search').value.trim().toLowerCase();root.innerHTML='';
  $$('.d3-filter-row [data-filter]').forEach(button=>{const active=button.dataset.filter===filter;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
  if(filter==='queue'){
    const queue=activeQueue().filter(item=>`${item.title} ${item.subtitle}`.toLowerCase().includes(query));
    $('#d3NavCount').textContent=`${queue.length} مطلوب`;
    if(!queue.length){root.innerHTML='<div class="d3-empty">لا توجد أعمال مطلوبة الآن.<br>كل شيء تحت السيطرة.</div>';return}
    queue.forEach(item=>root.append(queueItem(item)));return;
  }
  const items=developerDefinitions.filter(item=>(filter==='all'||item.kind===filter)&&`${entityName(item)} ${item.description} ${item.sourceKey}`.toLowerCase().includes(query));
  $('#d3NavCount').textContent=`${items.length} عنصر`;
  for(const [kind,label] of [['scene','المشاهد والرحلات'],['element','العناصر']]){
    const group=items.filter(item=>item.kind===kind);if(!group.length)continue;
    const heading=document.createElement('div');heading.className='d3-group-label';heading.textContent=label;root.append(heading);group.forEach(item=>root.append(entityItem(item)));
  }
  if(!items.length)root.innerHTML='<div class="d3-empty">لا توجد نتيجة مطابقة.<br>جرّب كلمة أقصر.</div>';
}
function entityItem(definition){
  const status=entityStatus(definition),button=document.createElement('button');button.type='button';button.className='d3-nav-item'+(selection.type==='entity'&&definitionKey(selection.definition)===definitionKey(definition)?' active':'');
  button.innerHTML=`<span class="d3-nav-mark">${esc(definition.mark)}</span><span class="d3-nav-copy"><strong>${esc(entityName(definition))}</strong><span>${esc(definition.description)}</span></span><span class="d3-nav-meta"><i class="d3-state-dot ${esc(status)}"></i>${esc(status?STATUS[status]:'')}</span>`;
  button.onclick=()=>selectEntity(definition);return button;
}
function queueItem(item){
  const button=document.createElement('button');button.type='button';button.className='d3-nav-item';const mark=item.type==='request'?'＋':item.definition.mark;
  button.innerHTML=`<span class="d3-nav-mark">${esc(mark)}</span><span class="d3-nav-copy"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span></span><span class="d3-nav-meta"><i class="d3-state-dot ${esc(item.status)}"></i>${esc(item.type==='thread'?STATUS[item.status]:REQUEST_STATUS[item.status])}</span>`;
  button.onclick=()=>{if(item.type==='thread'){selectEntity(item.definition,{openReview:true})}else selectRequest(item.value)};return button;
}
function updateCounts(){const count=activeQueue().length;for(const id of['#d3QueueCount','#d3MobileCount']){const node=$(id);node.textContent=count;node.hidden=!count}$('#d3DrawerReviewCount').textContent=selection.type==='entity'?threadsFor(selection.definition).filter(item=>!['approved','rejected'].includes(item.status)).length:(selection.request?.comments||[]).length}

function selectEntity(definition,{openReview=false}={}){selection={type:'entity',definition};compareOpen=false;setCompare(false);loadPreview();renderSelection();renderNavigator();history.replaceState(null,'',`#${definition.kind}=${encodeURIComponent(definition.id)}`);mobileView('preview');if(openReview)openDrawer('review')}
function selectRequest(request){selection={type:'request',request};compareOpen=false;setCompare(false);renderSelection();renderNavigator();mobileView('work');openDrawer('review')}
function loadPreview(){
  if(selection.type!=='entity')return;const frame=$('#d3PreviewFrame'),stateNode=$('#d3PreviewState');stateNode.innerHTML='<span class="d3-spinner" aria-hidden="true"></span><strong>جارٍ تجهيز المعاينة</strong><small>ستظهر النتيجة هنا دون مغادرة مساحة العمل.</small>';stateNode.classList.remove('hidden');
  frame.onload=()=>stateNode.classList.add('hidden');frame.onerror=()=>{stateNode.innerHTML='<strong>تعذر تحميل المعاينة</strong><small>أعد المحاولة أو افتح المشهد في نافذة مستقلة.</small>'};frame.src=previewUrl(selection.definition);
}
function renderSelection(){
  if(selection.type==='request'){renderRequestSelection();return}
  const definition=selection.definition,status=entityStatus(definition),threads=threadsFor(definition),ready=threads.filter(item=>item.status==='ready_for_review').length;
  $('#d3SelectionKind').textContent=definition.label;$('#d3SelectionTitle').textContent=entityName(definition);$('#d3SelectionCode').textContent=definition.sourceKey;$('#d3SelectionStatus').textContent=status?STATUS[status]:'لا توجد ملاحظات';$('#d3SelectionStatus').className=`d3-status ${status||'neutral'}`;
  $('#d3ContextTitle').textContent='ماذا تريد أن تفعل؟';$('#d3ContextDescription').textContent=definition.description;$('#d3ReviewHint').textContent=ready?`${ready} نتيجة تنتظر قرارك`:threads.some(item=>!['approved','rejected'].includes(item.status))?'يوجد عمل جارٍ على هذا المشهد':'لا توجد مراجعة تنتظر قرارك';
  $('#d3Replay').disabled=false;$('#d3CompareToggle').disabled=false;$('#d3Fullscreen').disabled=false;renderReviewPanel();refreshBrief();renderComparison();updateCounts();
}
function renderRequestSelection(){
  const request=selection.request;$('#d3SelectionKind').textContent=request.kind==='scene'?'طلب مشهد':'طلب عنصر';$('#d3SelectionTitle').textContent=request.title;$('#d3SelectionCode').textContent=`request:${request.id}`;$('#d3SelectionStatus').textContent=REQUEST_STATUS[request.status]||request.status;$('#d3SelectionStatus').className=`d3-status ${request.status}`;$('#d3ContextTitle').textContent='طلب تطوير جديد';$('#d3ContextDescription').textContent=request.description||'لا يوجد وصف.';$('#d3ReviewHint').textContent='راجع الطلب وردود التنفيذ';
  $('#d3PreviewFrame').src='about:blank';const stateNode=$('#d3PreviewState');stateNode.innerHTML='<strong>هذا طلب تطوير جديد</strong><small>سيظهر في المعاينة بعد تنفيذه وربطه بالمنصة.</small>';stateNode.classList.remove('hidden');$('#d3Replay').disabled=true;$('#d3CompareToggle').disabled=true;$('#d3Fullscreen').disabled=true;renderReviewPanel();refreshBrief();updateCounts();
}

function openDrawer(tab='task'){$('#d3DrawerScrim').hidden=false;$('#d3Drawer').classList.add('open');$('#d3Drawer').setAttribute('aria-hidden','false');document.body.dataset.drawer='open';setDrawerTab(tab);requestAnimationFrame(()=>$('#d3DrawerClose').focus({preventScroll:true}))}
function closeDrawer(){$('#d3DrawerScrim').hidden=true;$('#d3Drawer').classList.remove('open');$('#d3Drawer').setAttribute('aria-hidden','true');delete document.body.dataset.drawer;if(innerWidth<=760&&$('#d3App').dataset.mobileView==='work')$('#d3App').dataset.mobileView='preview'}
function setDrawerTab(tab){drawerTab=tab;$$('[data-drawer-tab]').forEach(button=>{const active=button.dataset.drawerTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});$$('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==tab);const titles={task:['مهمة تطوير','اطلب تعديلًا'],review:['سجل العمل','المراجعة والقرار'],brief:['جسر الذكاء','أمر التنفيذ']};$('#d3DrawerKicker').textContent=titles[tab][0];$('#d3DrawerTitle').textContent=titles[tab][1];if(tab==='brief')refreshBrief();if(tab==='review')renderReviewPanel()}
function taskEvidence(){return $$('.d3-evidence-options input:checked').map(input=>({desktop:'صورة كمبيوتر',mobile:'صورة جوال',functional:'اختبار وظيفي'}[input.value])).filter(Boolean)}
function buildTaskBody(){
  const problem=$('#d3TaskProblem').value.trim(),outcome=$('#d3TaskOutcome').value.trim(),criteria=$('#d3TaskCriteria').value.trim(),evidence=taskEvidence();
  return[`المشكلة الحالية:\n${problem}`,`النتيجة المطلوبة:\n${outcome}`,criteria?`معايير القبول:\n${criteria}`:'',evidence.length?`الدليل المطلوب:\n- ${evidence.join('\n- ')}`:''].filter(Boolean).join('\n\n');
}
function buildBrief(){
  const context=selection.type==='entity'?selection.definition:null,name=selection.type==='entity'?entityName(context):selection.request.title,source=selection.type==='entity'?context.sourceKey:`request:${selection.request.id}`,status=selection.type==='entity'?(STATUS[entityStatus(context)]||'لا توجد ملاحظات'):(REQUEST_STATUS[selection.request.status]||selection.request.status),task=buildTaskBody();
  return`أنت المطور الذكي لمنصة ياكلك. نفّذ المهمة التالية كتغيير نظيف ومحدود دون إضافة حشو أو كسر الرحلة الحالية.\n\nالسياق المرتبط:\n- النوع: ${selection.type==='entity'?context.label:'طلب تطوير'}\n- الاسم: ${name}\n- المعرف البرمجي: ${source}\n- الحالة الحالية: ${status}\n\n${task||'المطلوب: راجع العنصر الحالي وحدد أول تحسين واضح قابل للقياس.'}\n\nقواعد التنفيذ:\n1. عاين الحالة الحالية قبل التعديل.\n2. نفّذ أقل تغيير يحقق الهدف دون إعادة بناء غير لازمة.\n3. اختبر المسار فعليًا على الكمبيوتر والجوال.\n4. أرفق دليل قبل/بعد ونتيجة اختبار وظيفي.\n5. لا تعتبر المهمة مكتملة حتى تتحقق معايير القبول بلا أخطاء في وحدة التحكم أو تجاوز أفقي.`;
}
function refreshBrief(){$('#d3BriefText').value=buildBrief()}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('تم النسخ')}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove();toast('تم النسخ')}}
async function saveTask(event){
  event.preventDefault();if(selection.type!=='entity'){toast('اختر مشهدًا أو عنصرًا أولًا');return}const body=buildTaskBody();if(!$('#d3TaskProblem').value.trim()||!$('#d3TaskOutcome').value.trim())return;
  const definition=selection.definition;$('#d3SaveTask').disabled=true;
  try{const data=await post(REVIEW_API,{action:'create_thread',threadId:uuid('thread'),commentId:uuid('comment'),entityType:definition.kind,entityId:definition.id,authorRole:'reviewer',body,title:$('#d3TaskOutcome').value.trim().split('\n')[0].slice(0,100)});replaceThread(data.thread);$('#d3TaskForm').reset();$$('.d3-evidence-options input').forEach(input=>input.checked=true);setDrawerTab('review');toast('تم حفظ المهمة وربطها بالمعاينة')}catch(error){console.error(error);toast('تعذر حفظ المهمة')}finally{$('#d3SaveTask').disabled=false}
}

function renderReviewPanel(){
  const root=$('#d3ThreadList');root.innerHTML='';
  if(selection.type==='request'){renderRequestReview(root);return}
  const threads=threadsFor(selection.definition),active=threads.filter(item=>!['approved','rejected'].includes(item.status)),ready=threads.filter(item=>item.status==='ready_for_review').length;
  $('#d3ReviewSummary').innerHTML=`<span class="d3-review-chip">${threads.length} إجمالي</span><span class="d3-review-chip">${active.length} نشطة</span><span class="d3-review-chip">${ready} تنتظر قرارك</span>`;
  if(!threads.length){root.innerHTML='<div class="d3-empty">لا توجد مهام مرتبطة بهذا العنصر.<br>ابدأ من تبويب «المهمة».</div>';return}
  threads.forEach(thread=>root.append(threadNode(thread)));
}
function threadNode(thread){
  const article=document.createElement('article');article.className='d3-thread';article.dataset.threadId=thread.id;const comments=[...(thread.comments||[])].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))),latest=comments.at(-1);
  article.innerHTML=`<header><div class="d3-thread-title"><strong>${esc(thread.title||comments[0]?.body?.split('\n')[0]?.slice(0,90)||'مهمة')}</strong><span>${esc(formatTime(thread.updatedAt))} · ${comments.length} رسائل</span></div><span class="d3-status ${esc(thread.status)}">${esc(STATUS[thread.status]||thread.status)}</span></header><div class="d3-thread-body">${latest?commentCard(latest):''}<details><summary>عرض السجل الكامل</summary><div class="d3-timeline">${comments.map(commentCard).join('')}</div></details><textarea maxlength="12000" placeholder="اكتب تعقيبًا واضحًا…"></textarea><div class="d3-thread-actions">${threadActions(thread.status)}</div></div>`;
  article.querySelectorAll('[data-thread-action]').forEach(button=>button.onclick=()=>threadAction(article,button.dataset.threadAction));return article;
}
function commentCard(comment){return`<article class="d3-latest ${esc(comment.authorRole||'reviewer')}"><small><span>${esc(ROLE[comment.authorRole]||comment.authorRole)}</span><time>${esc(formatTime(comment.createdAt))}</time></small><p>${esc(comment.body)}</p></article>`}
function threadActions(status){
  if(status==='ready_for_review')return'<button class="d3-action approve" data-thread-action="approved">اعتماد النتيجة</button><button class="d3-action changes" data-thread-action="needs_changes">تحتاج تعديل</button><button class="d3-action" data-thread-action="reply-reviewer">إضافة تعقيب</button>';
  if(status==='needs_changes')return'<button class="d3-action primary" data-thread-action="reply-reviewer">إرسال التوضيح</button><button class="d3-action" data-thread-action="in_progress">بدأ التنفيذ</button>';
  if(status==='open'||status==='in_progress')return'<button class="d3-action primary" data-thread-action="reply-reviewer">إضافة تعقيب</button><button class="d3-action" data-thread-action="ready_for_review">جاهز للمراجعة</button>';
  return'<button class="d3-action" data-thread-action="reply-reviewer">إعادة فتح بتعقيب</button>';
}
async function threadAction(card,action){
  const input=card.querySelector('textarea'),text=input.value.trim(),threadId=card.dataset.threadId;let payload;
  if(action==='reply-reviewer'){if(!text){input.focus();return}payload={action:'add_comment',threadId,commentId:uuid('comment'),authorRole:'reviewer',kind:'reply',body:text}}
  else{if(action==='needs_changes'&&!text){input.placeholder='اكتب التعديل المطلوب قبل الإرسال';input.focus();return}const defaults={approved:'تمت مراجعة النتيجة واعتمادها.',needs_changes:'تحتاج النتيجة إلى تعديل إضافي.',in_progress:'بدأ المطور تنفيذ التعقيب.',ready_for_review:'اكتمل التنفيذ وأصبح جاهزًا للمراجعة.'};payload={action:'set_status',threadId,status:action,commentId:uuid('comment'),authorRole:['in_progress','ready_for_review'].includes(action)?'developer':'reviewer',body:text||defaults[action]}}
  try{const data=await post(REVIEW_API,payload);replaceThread(data.thread);toast('تم تحديث المهمة')}catch(error){console.error(error);toast('تعذر حفظ التحديث')}
}
function replaceThread(thread){const index=state.threads.findIndex(item=>item.id===thread.id);if(index>=0)state.threads[index]=thread;else state.threads.unshift(thread);localSave();renderAll()}
function renderRequestReview(root){
  const request=selection.request,comments=[...(request.comments||[])].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));$('#d3ReviewSummary').innerHTML=`<span class="d3-review-chip">${esc(REQUEST_STATUS[request.status]||request.status)}</span><span class="d3-review-chip">${comments.length} ردود</span>`;
  root.innerHTML=`<article class="d3-thread" data-request-id="${esc(request.id)}"><header><div class="d3-thread-title"><strong>${esc(request.title)}</strong><span>${esc(formatTime(request.updatedAt))}</span></div><span class="d3-status ${esc(request.status)}">${esc(REQUEST_STATUS[request.status]||request.status)}</span></header><div class="d3-thread-body"><article class="d3-latest"><small><span>وصف الطلب</span></small><p>${esc(request.description||'لا يوجد وصف')}${request.scenario?`\n\nمكانه في الرحلة: ${esc(request.scenario)}`:''}</p></article><div class="d3-timeline">${comments.map(commentCard).join('')}</div><textarea maxlength="12000" placeholder="اكتب تعقيبًا على الطلب…"></textarea><div class="d3-thread-actions"><button class="d3-action primary" data-request-action="reply-reviewer">إضافة تعقيب</button><button class="d3-action" data-request-action="in_review">قيد المراجعة</button><button class="d3-action approve" data-request-action="accepted">قبول</button><button class="d3-action approve" data-request-action="implemented">تمت إضافته</button><button class="d3-action reject" data-request-action="rejected">رفض</button></div></div></article>`;
  root.querySelectorAll('[data-request-action]').forEach(button=>button.onclick=()=>requestAction(root.querySelector('[data-request-id]'),button.dataset.requestAction));
}
async function requestAction(card,action){
  const requestId=Number(card.dataset.requestId),input=card.querySelector('textarea'),body=input.value.trim();try{let data;if(action==='reply-reviewer'){if(!body){input.focus();return}data=await post(WORKSPACE_API,{action:'request_comment',requestId,commentId:uuid('request-comment'),authorRole:'reviewer',body})}else data=await post(WORKSPACE_API,{action:'request_status',requestId,status:action});replaceRequest(data.request);toast('تم تحديث الطلب')}catch(error){console.error(error);toast('تعذر تحديث الطلب')}
}
function replaceRequest(request){const index=state.requests.findIndex(item=>Number(item.id)===Number(request.id));if(index>=0)state.requests[index]=request;else state.requests.unshift(request);if(selection.type==='request'&&Number(selection.request.id)===Number(request.id))selection.request=request;localSave();renderAll()}

function setCompare(open){compareOpen=open;$('#d3CompareToggle').setAttribute('aria-pressed',String(open));$('#d3CompareView').hidden=!open;$('#d3LiveView').hidden=open;if(open)loadCompareFrames()}
function renderComparison(){if(selection.type!=='entity')return;const saved=comparisonFor(selection.definition),current=previewUrl(selection.definition);$('#d3BeforeUrl').value=saved?.beforeUrl||'';$('#d3AfterUrl').value=saved?.afterUrl||current;$('#d3CompareMessage').textContent=state.remote?'الحفظ مشترك':'الحفظ المحلي متاح';if(compareOpen)loadCompareFrames()}
function loadFrame(frame,empty,value){const url=normalizeUrl(value);empty.hidden=Boolean(url);frame.src=url||'about:blank'}
function loadCompareFrames(){loadFrame($('#d3BeforeFrame'),$('#d3BeforeEmpty'),$('#d3BeforeUrl').value);loadFrame($('#d3AfterFrame'),$('#d3AfterEmpty'),$('#d3AfterUrl').value)}
async function saveComparison(){if(selection.type!=='entity')return;const definition=selection.definition,comparison={itemKey:comparisonKey(definition),itemKind:'entity',beforeUrl:normalizeUrl($('#d3BeforeUrl').value),afterUrl:normalizeUrl($('#d3AfterUrl').value),updatedAt:new Date().toISOString()};const index=state.comparisons.findIndex(item=>item.itemKey===comparison.itemKey);if(index>=0)state.comparisons[index]=comparison;else state.comparisons.push(comparison);localSave();$('#d3CompareMessage').textContent='جارٍ الحفظ…';try{const data=await post(COMPARISON_API,{action:'save',...comparison});const found=state.comparisons.findIndex(item=>item.itemKey===comparison.itemKey);state.comparisons[found]=data.comparison;state.remote=true;localSave();$('#d3CompareMessage').textContent='تم حفظ المقارنة للجميع';toast('تم حفظ المقارنة')}catch(error){console.warn(error);$('#d3CompareMessage').textContent='حُفظت محليًا';toast('حُفظت المقارنة محليًا')}}

function openRequestModal(){$('#d3ModalScrim').hidden=false;$('#d3RequestModal').hidden=false;requestKind='scene';$$('[data-request-kind]').forEach(button=>button.classList.toggle('active',button.dataset.requestKind==='scene'));$('#d3RequestForm').reset();requestAnimationFrame(()=>$('#d3RequestName').focus())}
function closeRequestModal(){$('#d3ModalScrim').hidden=true;$('#d3RequestModal').hidden=true}
async function submitRequest(event){event.preventDefault();const title=$('#d3RequestName').value.trim(),description=$('#d3RequestDescription').value.trim();if(!title||!description)return;try{const data=await post(WORKSPACE_API,{action:'request_create',kind:requestKind,title,description,scenario:$('#d3RequestScenario').value.trim()});replaceRequest(data.request);closeRequestModal();filter='queue';selectRequest(data.request);toast('تم حفظ الطلب وفتحه للمراجعة')}catch(error){console.error(error);toast('تعذر حفظ الطلب')}}

function utilityOpen(kind){const utility=$('#d3Utility'),frame=$('#d3UtilityFrame');utility.hidden=false;if(kind==='game'){$('#d3UtilityKicker').textContent='معاينة منشورة';$('#d3UtilityTitle').textContent='اللعبة دون أدوات التطوير';frame.removeAttribute('srcdoc');frame.src=new URL('./',document.baseURI).toString()}else{$('#d3UtilityKicker').textContent='خريطة بصرية';$('#d3UtilityTitle').textContent='مخطط رحلة اللعبة';frame.src='about:blank';requestAnimationFrame(()=>buildFlow(frame))}}
function utilityClose(){$('#d3Utility').hidden=true;$('#d3UtilityFrame').src='about:blank';$('#d3UtilityFrame').removeAttribute('srcdoc')}
function flowNodes(){if(state.board?.version===3&&Array.isArray(state.board.nodes))return state.board.nodes;return developerDefinitions.filter(item=>item.kind==='scene').map((item,index)=>({id:item.id,title:entityName(item),note:'',x:60+(index%3)*300,y:80+Math.floor(index/3)*190,kind:'scene'}))}
function buildFlow(frame){
  const nodes=flowNodes(),payload=JSON.stringify(nodes).replace(/</g,'\\u003c');frame.srcdoc=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:system-ui;background:#f7f7f4 radial-gradient(#ccc 1px,transparent 1px);background-size:22px 22px}.bar{position:fixed;z-index:10;top:12px;right:12px;display:flex;gap:7px;padding:7px;border:1px solid #ddd;border-radius:12px;background:#fff}.bar button{min-height:40px;border:0;border-radius:9px;padding:0 12px;font-weight:900}.bar .save{background:#222;color:#fff}.canvas{position:absolute;inset:0;transform-origin:0 0}.node{position:absolute;width:240px;padding:12px;border:1px solid #ccc;border-radius:15px;background:#fff;box-shadow:0 10px 25px #0001;cursor:grab}.node strong{display:block}.node small{color:#777}.node textarea{width:100%;min-height:62px;margin-top:9px;border:1px solid #ddd;border-radius:9px;padding:8px;resize:vertical}.scenario{background:#fff8e6}</style></head><body><div class="bar"><button id="add">＋ سيناريو</button><button id="save" class="save">حفظ المخطط</button></div><div id="canvas" class="canvas"></div><script>let nodes=${payload};const canvas=document.getElementById('canvas');function esc(v){return String(v||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}function draw(){canvas.innerHTML=nodes.map((n,i)=>'<article class="node '+(n.kind==='scenario'?'scenario':'')+'" data-i="'+i+'" style="left:'+n.x+'px;top:'+n.y+'px"><small>'+(n.kind==='scenario'?'سيناريو':'مشهد')+'</small><strong>'+esc(n.title)+'</strong><textarea placeholder="ملاحظات الانتقال...">'+esc(n.note)+'</textarea></article>').join('');document.querySelectorAll('.node').forEach(node=>{const i=Number(node.dataset.i),area=node.querySelector('textarea');area.oninput=()=>nodes[i].note=area.value;node.onpointerdown=e=>{if(e.target===area)return;node.setPointerCapture(e.pointerId);const sx=e.clientX,sy=e.clientY,ox=nodes[i].x,oy=nodes[i].y;node.onpointermove=m=>{nodes[i].x=ox+m.clientX-sx;nodes[i].y=oy+m.clientY-sy;node.style.left=nodes[i].x+'px';node.style.top=nodes[i].y+'px'};node.onpointerup=()=>node.onpointermove=null}})}draw();document.getElementById('add').onclick=()=>{nodes.push({id:'scenario-'+Date.now(),title:'سيناريو جديد',note:'',x:120,y:120,kind:'scenario'});draw()};document.getElementById('save').onclick=()=>parent.postMessage({type:'yakolak-d3-board-save',nodes},'*');<\/script></body></html>`;
}
async function saveBoard(nodes){state.board={version:3,nodes};localSave();try{const data=await post(WORKSPACE_API,{action:'board_save',board:state.board,nodeCount:nodes.length,connectionCount:0});state.board=data.workspace.board;localSave();toast('تم حفظ المخطط المشترك')}catch(error){console.warn(error);toast('حُفظ المخطط محليًا')}}

async function loadAll(){
  setSync('جارٍ المزامنة');const local=localRead();for(const key of['entities','threads','requests','comparisons','board'])if(local[key])state[key]=local[key];renderAll();
  try{const [reviews,workspace,comparisons]=await Promise.all([jsonFetch(REVIEW_API),jsonFetch(WORKSPACE_API),jsonFetch(COMPARISON_API)]);state.entities=reviews.entities||[];state.threads=reviews.threads||[];state.requests=workspace.requests||[];state.board=workspace.board||state.board;state.comparisons=comparisons.comparisons||[];state.remote=true;localSave();setSync('متصل','ok')}catch(error){console.warn('[Yakolak] D3 local fallback',error);setSync('عرض محلي','warn')}
  renderAll();document.body.dataset.developerBuild='D3-task-workspace';document.body.dataset.developerReady='true';
}
function renderAll(){renderNavigator();renderSelection();updateCounts()}
function restoreHash(){const match=location.hash.match(/^#(scene|element)=([^&]+)/);if(!match)return;const definition=developerDefinitions.find(item=>item.kind===match[1]&&item.id===decodeURIComponent(match[2]));if(definition)selection={type:'entity',definition}}
function bind(){
  $$('.d3-filter-row [data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;renderNavigator()});$('#d3Search').oninput=renderNavigator;$('#d3OpenQueue').onclick=()=>{filter='queue';renderNavigator();mobileView('content')};$('#d3MobileContent').onclick=()=>mobileView('content');
  $('#d3Replay').onclick=loadPreview;$('#d3CompareToggle').onclick=()=>setCompare(!compareOpen);$('#d3Fullscreen').onclick=()=>$('#d3PreviewShell').requestFullscreen?.();$('#d3BeforeUrl').onchange=loadCompareFrames;$('#d3AfterUrl').onchange=loadCompareFrames;$('#d3UseCurrent').onclick=()=>{if(selection.type==='entity'){$('#d3AfterUrl').value=previewUrl(selection.definition);loadCompareFrames()}};$('#d3SaveCompare').onclick=saveComparison;$$('[data-open-compare]').forEach(button=>button.onclick=()=>{const url=normalizeUrl(button.dataset.openCompare==='before'?$('#d3BeforeUrl').value:$('#d3AfterUrl').value);if(url)open(url,'_blank','noopener,noreferrer')});
  $('#d3StartTask').onclick=()=>openDrawer('task');$('#d3ReviewOpen').onclick=()=>openDrawer('review');$('#d3BriefOpen').onclick=()=>openDrawer('brief');$('#d3DrawerClose').onclick=closeDrawer;$('#d3DrawerScrim').onclick=closeDrawer;$$('[data-drawer-tab]').forEach(button=>button.onclick=()=>setDrawerTab(button.dataset.drawerTab));$('#d3TaskForm').onsubmit=saveTask;$('#d3CopyTask').onclick=()=>copyText(buildBrief());$('#d3CopyBrief').onclick=()=>copyText($('#d3BriefText').value);$('#d3RefreshBrief').onclick=refreshBrief;
  $('#d3NewRequest').onclick=openRequestModal;$('#d3RequestClose').onclick=closeRequestModal;$('#d3ModalScrim').onclick=closeRequestModal;$$('[data-request-kind]').forEach(button=>button.onclick=()=>{requestKind=button.dataset.requestKind;$$('[data-request-kind]').forEach(item=>item.classList.toggle('active',item===button))});$('#d3RequestForm').onsubmit=submitRequest;
  $('#d3FlowOpen').onclick=()=>utilityOpen('flow');$('#d3GameOpen').onclick=()=>utilityOpen('game');$('#d3UtilityClose').onclick=utilityClose;$$('.d3-mobile-nav [data-mobile-view]').forEach(button=>button.onclick=()=>mobileView(button.dataset.mobileView));
  addEventListener('message',event=>{if(event.data?.type==='yakolak-d3-board-save'&&Array.isArray(event.data.nodes))saveBoard(event.data.nodes)});
  addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#d3RequestModal').hidden)closeRequestModal();else if(!$('#d3Utility').hidden)utilityClose();else if($('#d3Drawer').classList.contains('open'))closeDrawer();else mobileView('preview')}if(event.target.matches('input,textarea'))return;if(event.key.toLowerCase()==='r'&&selection.type==='entity')loadPreview();if(event.key.toLowerCase()==='c'&&selection.type==='entity')setCompare(!compareOpen);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();mobileView('content');$('#d3Search').focus()}});
}

restoreHash();bind();loadPreview();renderAll();loadAll();
