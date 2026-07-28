const API='./api/developer-president';
const CANONICAL='./ops/ai-team/development-blueprint.json';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=prefix=>`${prefix}:${crypto.randomUUID()}`;
const TYPE_LABEL={goal:'هدف',scene:'مشهد',task:'مهمة',decision:'قرار',risk:'مخاطرة',evidence:'دليل'};
const STATUS_LABEL={idea:'فكرة',documented:'موثقة',ready:'جاهزة للتنفيذ',in_progress:'قيد البرمجة',review:'قيد المراجعة',completed:'مكتملة',blocked:'متوقفة',cancelled:'ملغاة'};
const DEFAULT_BOARD={schemaVersion:1,title:'مسار تطوير ياكلك',nodes:[],edges:[]};
const state={canonical:null,draft:null,board:clone(DEFAULT_BOARD),apiVersion:0,selectedId:'',connectFrom:'',dirty:false,loading:false};

async function json(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});
  if(!response.ok){const error=new Error(`${url}_${response.status}`);error.status=response.status;throw error}
  const data=await response.json();
  if(data?.ok===false)throw new Error(data.error||'invalid_response');
  return data;
}
const post=body=>json(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function normalUrl(value){try{const url=new URL(String(value||''),document.baseURI);return ['http:','https:'].includes(url.protocol)?url.toString():''}catch{return''}}
function boardFrom(source){
  const board=source&&typeof source==='object'?clone(source):clone(DEFAULT_BOARD);
  board.schemaVersion=1;
  board.title=String(board.title||'مسار تطوير ياكلك');
  board.nodes=Array.isArray(board.nodes)?board.nodes:[];
  board.edges=Array.isArray(board.edges)?board.edges:[];
  return board;
}
function selected(){return state.board.nodes.find(node=>node.id===state.selectedId)||null}
function nodeCenter(node){return{x:Number(node.x||0)+130,y:Number(node.y||0)+72}}
function setStatus(text,tone=''){
  const element=$('#blueprintStatus');
  if(!element)return;
  element.textContent=text;
  element.className=`blueprint-status${tone?` ${tone}`:''}`;
}
function markDirty(text='تعديلات غير محفوظة'){
  state.dirty=true;
  setStatus(text,'warn');
}
function inject(){
  if($('#presidentBlueprint'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./src/developer-blueprint.css?v=Blueprint-v1';document.head.append(link);
  const directiveTab=document.querySelector('[data-president-tab="directives"]');
  const tab=document.createElement('button');
  tab.type='button';tab.className='president-tab';tab.dataset.presidentTab='blueprint';
  tab.innerHTML='مسار التطوير <b id="presidentBlueprintCount">0</b>';
  directiveTab?.insertAdjacentElement('afterend',tab);
  const main=document.querySelector('.president-main');
  main?.insertAdjacentHTML('beforeend',`
    <section id="presidentBlueprint" class="president-section" hidden>
      <div class="blueprint-shell">
        <header class="blueprint-toolbar">
          <div><strong>البرمجة بعد التوثيق</strong><span id="blueprintRevision">جارٍ تحميل المسار المرجعي…</span></div>
          <div class="blueprint-actions">
            <button type="button" data-add-blueprint="goal">＋ هدف</button>
            <button type="button" data-add-blueprint="scene">＋ مشهد</button>
            <button type="button" data-add-blueprint="task">＋ مهمة</button>
            <button type="button" data-add-blueprint="decision">＋ قرار</button>
            <button id="blueprintConnect" type="button">↔ ربط</button>
            <button id="blueprintAutoLayout" type="button">ترتيب</button>
            <button id="blueprintReset" type="button">نسخة راشد</button>
            <button id="blueprintSave" class="primary" type="button">حفظ تعديل الرئيس</button>
          </div>
        </header>
        <div class="blueprint-guidance">راشد يوثق الهدف والسلوك ومعيار النجاح هنا أولًا، ثم يربط كل مهمة برمجية بعقدة ورقم مراجعة. تستطيع تعديل المسار متى حضرت؛ وسيوقف راشد مبادرته عند وجود تعديل جديد حتى يعالجه.</div>
        <div class="blueprint-workspace">
          <div class="blueprint-canvas-wrap">
            <div id="blueprintCanvas" class="blueprint-canvas" tabindex="0" aria-label="وايت بورد مسار تطوير ياكلك">
              <svg id="blueprintEdges" class="blueprint-edges" width="2400" height="1500" aria-hidden="true"></svg>
              <div id="blueprintNodes"></div>
            </div>
          </div>
          <aside id="blueprintInspector" class="blueprint-inspector"></aside>
        </div>
        <footer class="blueprint-footer"><span id="blueprintStatus" class="blueprint-status">جاهز</span><span>العقدة الموثقة هي مرجع المهمة وليست بديلًا عن الاختبارات أو المراجعة.</span></footer>
      </div>
    </section>`);
  tab.onclick=activateBlueprint;
  document.querySelectorAll('[data-president-tab="reviews"],[data-president-tab="directives"]').forEach(button=>button.addEventListener('click',deactivateBlueprint));
  const observer=new MutationObserver(()=>{if(tab.classList.contains('active'))activateBlueprint(false)});
  observer.observe(document.querySelector('.president-main'),{subtree:true,attributes:true,attributeFilter:['hidden']});
  document.querySelectorAll('[data-add-blueprint]').forEach(button=>button.onclick=()=>addNode(button.dataset.addBlueprint));
  $('#blueprintConnect').onclick=startConnection;
  $('#blueprintAutoLayout').onclick=autoLayout;
  $('#blueprintReset').onclick=resetToCanonical;
  $('#blueprintSave').onclick=save;
  $('#blueprintCanvas').ondblclick=event=>{
    if(event.target.closest('.blueprint-node'))return;
    const rect=$('#blueprintCanvas').getBoundingClientRect();
    addNode('task',{x:event.clientX-rect.left+$('#blueprintCanvas').parentElement.scrollLeft,y:event.clientY-rect.top+$('#blueprintCanvas').parentElement.scrollTop});
  };
}
function activateBlueprint(open=true){
  if(open)window.__yakolakPresidentPortal?.open?.();
  document.querySelectorAll('[data-president-tab]').forEach(button=>button.classList.toggle('active',button.dataset.presidentTab==='blueprint'));
  const reviews=$('#presidentReviews'),directives=$('#presidentDirectives'),section=$('#presidentBlueprint');
  if(reviews)reviews.hidden=true;if(directives)directives.hidden=true;if(section)section.hidden=false;
}
function deactivateBlueprint(){const section=$('#presidentBlueprint');if(section)section.hidden=true}
function addNode(type,{x,y}={}){
  const count=state.board.nodes.length;
  const node={
    id:uuid('plan'),type,title:TYPE_LABEL[type]||'عقدة جديدة',body:'',status:type==='goal'?'documented':'idea',owner:'',taskId:'',evidenceUrl:'',
    x:Number.isFinite(x)?Math.max(20,x-130):120+(count%4)*310,
    y:Number.isFinite(y)?Math.max(20,y-70):180+Math.floor(count/4)*220,
    revision:1
  };
  state.board.nodes.push(node);state.selectedId=node.id;markDirty('أضيفت عقدة؛ أكمل توثيقها ثم احفظ');render();
}
function deleteSelected(){
  if(!state.selectedId)return;
  state.board.nodes=state.board.nodes.filter(node=>node.id!==state.selectedId);
  state.board.edges=state.board.edges.filter(edge=>edge.from!==state.selectedId&&edge.to!==state.selectedId);
  state.selectedId='';state.connectFrom='';markDirty('حُذفت العقدة محليًا');render();
}
function startConnection(){
  if(!state.selectedId){setStatus('اختر عقدة أولًا ثم اضغط ربط','warn');return}
  state.connectFrom=state.selectedId;
  setStatus('اختر العقدة الثانية لإنشاء الرابط','warn');
  renderNodes();
}
function selectNode(id){
  if(state.connectFrom&&state.connectFrom!==id){
    const exists=state.board.edges.some(edge=>edge.from===state.connectFrom&&edge.to===id);
    if(!exists)state.board.edges.push({id:uuid('edge'),from:state.connectFrom,to:id,label:''});
    state.connectFrom='';state.selectedId=id;markDirty('أضيف رابط بين العقدتين');render();return;
  }
  state.selectedId=id;renderNodes();renderInspector();
}
function renderEdges(){
  const svg=$('#blueprintEdges');if(!svg)return;
  svg.innerHTML=state.board.edges.map(edge=>{
    const from=state.board.nodes.find(node=>node.id===edge.from),to=state.board.nodes.find(node=>node.id===edge.to);
    if(!from||!to)return'';
    const a=nodeCenter(from),b=nodeCenter(to),mid=(a.x+b.x)/2;
    return`<g data-edge-id="${esc(edge.id)}"><path d="M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}"></path>${edge.label?`<text x="${mid}" y="${(a.y+b.y)/2-7}">${esc(edge.label)}</text>`:''}</g>`;
  }).join('');
}
function nodeCard(node){
  const element=document.createElement('article');
  element.className=`blueprint-node type-${node.type} status-${node.status}${node.id===state.selectedId?' selected':''}${node.id===state.connectFrom?' connecting':''}`;
  element.dataset.nodeId=node.id;element.style.left=`${node.x}px`;element.style.top=`${node.y}px`;
  const evidence=normalUrl(node.evidenceUrl);
  element.innerHTML=`<header class="blueprint-node-header"><span>${esc(TYPE_LABEL[node.type]||node.type)}</span><i>${esc(STATUS_LABEL[node.status]||node.status)}</i></header><strong>${esc(node.title)}</strong><p>${esc(node.body||'أضف الهدف أو السلوك المتوقع من لوحة الخصائص.')}</p><footer><span>${esc(node.owner||'بلا مالك')}</span><code>${esc(node.taskId||`rev:${node.revision||1}`)}</code>${evidence?`<a href="${esc(evidence)}" target="_blank" rel="noopener noreferrer">دليل ↗</a>`:''}</footer>`;
  element.onclick=event=>{if(event.target.closest('a'))return;selectNode(node.id)};
  const handle=element.querySelector('.blueprint-node-header');
  handle.onpointerdown=event=>beginDrag(event,node,element);
  return element;
}
function renderNodes(){
  const root=$('#blueprintNodes');if(!root)return;
  root.innerHTML='';state.board.nodes.forEach(node=>root.append(nodeCard(node)));renderEdges();
  const active=state.board.nodes.filter(node=>!['completed','cancelled'].includes(node.status)).length;
  $('#presidentBlueprintCount').textContent=active;
}
function beginDrag(event,node,element){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  const startX=event.clientX,startY=event.clientY,originX=Number(node.x||0),originY=Number(node.y||0);
  element.setPointerCapture(event.pointerId);
  element.classList.add('dragging');
  const move=moveEvent=>{
    node.x=Math.max(0,Math.min(4000,originX+moveEvent.clientX-startX));
    node.y=Math.max(0,Math.min(3000,originY+moveEvent.clientY-startY));
    element.style.left=`${node.x}px`;element.style.top=`${node.y}px`;renderEdges();
  };
  const end=()=>{
    element.classList.remove('dragging');element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);markDirty('تحركت العقدة؛ احفظ لتثبيت المسار');
  };
  element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
}
function renderInspector(){
  const root=$('#blueprintInspector');if(!root)return;
  const node=selected();
  if(!node){root.innerHTML='<div class="blueprint-inspector-empty"><strong>اختر عقدة</strong><p>راجع تفاصيلها أو عدّلها، ثم احفظ تعديل الرئيس ليقرأه راشد.</p></div>';return}
  root.innerHTML=`
    <header><strong>توثيق العقدة</strong><button id="blueprintDelete" type="button">حذف</button></header>
    <label><span>العنوان</span><input data-field="title" maxlength="180" value="${esc(node.title)}"></label>
    <div class="blueprint-inspector-grid">
      <label><span>النوع</span><select data-field="type">${Object.entries(TYPE_LABEL).map(([value,label])=>`<option value="${value}"${node.type===value?' selected':''}>${label}</option>`).join('')}</select></label>
      <label><span>الحالة</span><select data-field="status">${Object.entries(STATUS_LABEL).map(([value,label])=>`<option value="${value}"${node.status===value?' selected':''}>${label}</option>`).join('')}</select></label>
    </div>
    <label><span>التوثيق قبل البرمجة</span><textarea data-field="body" maxlength="6000" placeholder="المشكلة، النتيجة المطلوبة، معيار النجاح، والحدود…">${esc(node.body)}</textarea></label>
    <label><span>المالك أو المسؤول</span><input data-field="owner" maxlength="80" value="${esc(node.owner||'')}"></label>
    <label><span>معرف المهمة البرمجية</span><input data-field="taskId" maxlength="120" value="${esc(node.taskId||'')}" placeholder="YAK-005-01"></label>
    <label><span>رابط PR أو المعاينة أو الدليل</span><input data-field="evidenceUrl" maxlength="1000" dir="ltr" value="${esc(node.evidenceUrl||'')}"></label>
    <div class="blueprint-node-revision">مراجعة العقدة: ${Number(node.revision||1)} · مراجعة المسار الرسمية: ${Number(state.canonical?.revision||0)}</div>`;
  root.querySelectorAll('[data-field]').forEach(field=>field.onchange=()=>{
    const key=field.dataset.field,value=field.value.trim();
    if(node[key]===value)return;
    node[key]=value;node.revision=Math.max(1,Number(node.revision||1)+1);markDirty('عدّل الرئيس التوثيق؛ سيصبح عمل راشد القديم متوقفًا حتى يقرأه');renderNodes();renderInspector();
  });
  $('#blueprintDelete').onclick=deleteSelected;
}
function autoLayout(){
  const order={goal:0,decision:1,scene:2,task:3,risk:4,evidence:5};
  const nodes=[...state.board.nodes].sort((a,b)=>(order[a.type]??9)-(order[b.type]??9)||a.title.localeCompare(b.title,'ar'));
  nodes.forEach((node,index)=>{node.x=100+(index%4)*320;node.y=90+Math.floor(index/4)*230});
  markDirty('رُتب المسار محليًا');render();
}
function resetToCanonical(){
  if(!state.canonical)return;
  state.board=boardFrom(state.canonical);state.selectedId='';state.connectFrom='';state.dirty=false;setStatus('تم الرجوع إلى النسخة الرسمية التي وثقها راشد','ok');render();
}
function renderRevision(){
  const canonicalRevision=Number(state.canonical?.revision||0),draftVersion=Number(state.draft?.version||0);
  const stale=state.draft&&Number(state.draft.baseRevision)!==canonicalRevision;
  $('#blueprintRevision').textContent=state.draft?`نسخة راشد ${canonicalRevision} · تعديل الرئيس ${draftVersion}${stale?' · يحتاج مصالحة':''}`:`نسخة راشد ${canonicalRevision} · لا توجد تعديلات معلقة`;
}
function render(){renderRevision();renderNodes();renderInspector()}
async function load(){
  if(state.loading)return;state.loading=true;setStatus('جارٍ تحميل مسار التطوير');
  try{
    const [canonical,channel]=await Promise.all([json(CANONICAL),json(API)]);
    state.canonical=canonical;state.draft=channel.blueprint||null;state.apiVersion=Number(state.draft?.version||0);
    state.board=boardFrom(state.draft?.board||canonical);state.selectedId='';state.connectFrom='';state.dirty=false;
    setStatus(state.draft?'يعرض تعديل الرئيس المحفوظ؛ راشد سيصالحه في مروره القادم':'يعرض النسخة الرسمية من راشد','ok');render();
  }catch(error){console.error(error);setStatus('تعذر تحميل مسار التطوير','error')}
  state.loading=false;
}
async function save(){
  if(!state.dirty){setStatus('لا توجد تعديلات جديدة للحفظ','ok');return}
  try{
    const data=await post({action:'blueprint_save',expectedVersion:state.apiVersion,baseRevision:Number(state.canonical?.revision||0),board:state.board});
    state.draft=data.blueprint;state.apiVersion=Number(data.blueprint.version||0);state.dirty=false;
    setStatus('تم حفظ تعديل الرئيس؛ راشد سيقرأه قبل أي مبادرة جديدة','ok');renderRevision();
  }catch(error){
    console.error(error);
    if(error.status===409)setStatus('تغير المسار في مكان آخر؛ حدّث الصفحة قبل الحفظ','error');else setStatus('تعذر حفظ تعديل المسار','error');
  }
}
function init(){
  if(!$('#presidentPortal')){setTimeout(init,40);return}
  inject();
  const flow=$('#d4FlowOpen');if(flow){flow.textContent='مسار التطوير';flow.onclick=()=>activateBlueprint(true)}
  load();
  window.__yakolakDevelopmentBlueprint={load,save,get board(){return clone(state.board)}};
}
init();
