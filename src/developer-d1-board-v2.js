const BOARD_V2_BUILD='D1-board-v2';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const workspace=()=>globalThis.__yakolakD1Workspace||null;
let selectedNodeId=null;
let editorBound=false;
let refreshTimer=0;

function injectStyles(){
  if(document.getElementById('d1BoardV2Styles'))return;
  const style=document.createElement('style');
  style.id='d1BoardV2Styles';
  style.textContent=`
  #d1BoardOverlay{background:#eeeee9}.d1-board-shell{display:grid;grid-template-columns:280px minmax(0,1fr) 310px;min-height:0;flex:1;direction:ltr}.d1-board-panel{min-width:0;background:#fff;overflow:auto;direction:rtl}.d1-board-library{border-right:1px solid #d8d6cf}.d1-board-inspector{border-left:1px solid #d8d6cf}.d1-board-panel-head{position:sticky;top:0;z-index:3;padding:16px;border-bottom:1px solid #e4e2dc;background:#ffffffee;backdrop-filter:blur(12px)}.d1-board-panel-head strong{display:block;font-size:15px}.d1-board-panel-head span{display:block;margin-top:4px;color:#77736c;font-size:10px;line-height:1.5}.d1-board-search{width:100%;margin-top:11px;border:1px solid #d7d4cd;border-radius:11px;background:#fafaf7;padding:10px 11px;outline:none}.d1-board-search:focus{border-color:#8f8a80;box-shadow:0 0 0 3px #20201e10}.d1-board-section{padding:14px 14px 2px}.d1-board-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 9px;color:#55514b;font-size:11px;font-weight:950}.d1-board-section-title small{display:grid;place-items:center;min-width:24px;height:24px;border-radius:99px;background:#efeee9;color:#34322e}.d1-board-quick{display:grid;grid-template-columns:1fr 1fr;gap:8px}.d1-board-add{border:1px solid #d8d5ce;border-radius:13px;background:#fff;padding:11px 9px;text-align:right;font-size:11px;font-weight:900;cursor:pointer}.d1-board-add:hover{border-color:#969188;background:#f9f8f4}.d1-board-add.note{background:#fff9d9}.d1-board-add.decision{background:#f2eafa}.d1-board-add.scenario{background:#fff1dc}.d1-board-list{display:grid;gap:7px}.d1-library-item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;width:100%;border:1px solid #dedbd4;border-radius:12px;background:#fff;padding:9px;text-align:right;cursor:pointer}.d1-library-item:hover{border-color:#969188}.d1-library-item[disabled]{opacity:.48;cursor:default;background:#f2f1ed}.d1-library-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#efeee9;font-size:12px;font-weight:950;direction:ltr}.d1-library-copy{min-width:0}.d1-library-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.d1-library-copy span{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#88837a;font-size:9px}.d1-library-plus{font-size:18px;font-weight:800}.d1-board-center{position:relative;min-width:0;min-height:0;display:flex;flex-direction:column;background:#f3f2ee;direction:rtl}.d1-board-center-tools{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:9px 11px;border-bottom:1px solid #d8d6cf;background:#fafaf7}.d1-board-center-tools .left,.d1-board-center-tools .right{display:flex;flex-wrap:wrap;gap:7px}.d1-board-tool{border:1px solid #d7d4cd;border-radius:10px;background:#fff;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}.d1-board-tool.primary{background:#222;color:#fff;border-color:#222}.d1-board-tool.danger{color:#8a3939}.d1-board-center .d1-canvas-wrap{position:relative;flex:1;min-height:0;overflow:hidden;background-color:#f8f7f3;background-image:linear-gradient(#dedbd4 1px,transparent 1px),linear-gradient(90deg,#dedbd4 1px,transparent 1px),linear-gradient(#ebe9e3 1px,transparent 1px),linear-gradient(90deg,#ebe9e3 1px,transparent 1px);background-size:88px 88px,88px 88px,22px 22px,22px 22px}.d1-board-center .d1-note{left:14px;right:auto;bottom:14px;max-width:370px;border-color:#cac7c0;box-shadow:0 8px 24px #00000012}.d1-board-minimap{position:absolute;right:14px;bottom:14px;z-index:11;width:170px;height:112px;border:1px solid #c9c6bf;border-radius:13px;background:#ffffffed;box-shadow:0 10px 30px #0002;overflow:hidden;direction:ltr}.d1-board-minimap svg{display:block;width:100%;height:100%}.d1-board-minimap-label{position:absolute;left:8px;top:6px;color:#77736c;font-size:8px;font-weight:900;direction:rtl}.drawflow .drawflow-node{width:270px;border:1px solid #c9c5bd;border-radius:18px;background:#fff;box-shadow:0 12px 30px #211f1a1c;transition:border-color .16s ease,box-shadow .16s ease}.drawflow .drawflow-node.selected{border-color:#262522;box-shadow:0 0 0 3px #2625221f,0 18px 38px #211f1a26}.drawflow .drawflow-node.note-node{background:#fffcef}.drawflow .drawflow-node.scenario-node{background:#fff6e8}.drawflow .drawflow-node.decision-node{background:#f8f1fc}.drawflow .drawflow-node.request-node{background:#edf5f8}.drawflow .drawflow-node.scene-node{background:#fff}.drawflow .drawflow-node .input,.drawflow .drawflow-node .output{width:14px;height:14px;border:2px solid #fff;background:#55514b;box-shadow:0 0 0 1px #77736c}.drawflow .connection .main-path{stroke:#625e57;stroke-width:4px}.d1-node-v2{width:238px;direction:rtl}.d1-node-v2-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.d1-node-v2 em{display:inline-flex;padding:5px 8px;border-radius:99px;background:#e9e7e1;color:#55514b;font-size:9px;font-style:normal;font-weight:950}.d1-node-v2-menu{border:0;background:transparent;color:#77736c;font-size:17px;cursor:pointer}.d1-node-v2 strong{display:block;margin-top:9px;font-size:15px;line-height:1.35}.d1-node-v2 p{display:-webkit-box;margin:7px 0 0;overflow:hidden;color:#716d65;font-size:10px;line-height:1.55;-webkit-line-clamp:3;-webkit-box-orient:vertical;white-space:pre-wrap}.d1-node-v2 small{display:block;margin-top:8px;overflow:hidden;color:#99948b;font:8px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;direction:ltr;text-align:left;text-overflow:ellipsis;white-space:nowrap}.d1-node-v2 .d1-preview{margin-top:9px}.d1-inspector-empty{padding:44px 20px;text-align:center;color:#77736c;font-size:12px;line-height:1.7}.d1-inspector-form{display:grid;gap:13px;padding:15px}.d1-inspector-type{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border:1px solid #dedbd4;border-radius:12px;background:#f8f7f3;font-size:10px;font-weight:900}.d1-inspector-field{display:grid;gap:6px}.d1-inspector-field span{color:#55514b;font-size:10px;font-weight:950}.d1-inspector-field input,.d1-inspector-field textarea{width:100%;border:1px solid #d7d4cd;border-radius:11px;background:#fff;padding:10px 11px;outline:none}.d1-inspector-field textarea{min-height:130px;resize:vertical;line-height:1.65}.d1-inspector-field input:focus,.d1-inspector-field textarea:focus{border-color:#8f8a80;box-shadow:0 0 0 3px #20201e10}.d1-inspector-source{padding:9px;border:1px dashed #cac7c0;border-radius:10px;background:#f4f3ef;color:#77736c;font:9px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;direction:ltr;text-align:left;overflow-wrap:anywhere}.d1-inspector-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.d1-inspector-action{border:1px solid #d7d4cd;border-radius:11px;background:#fff;padding:10px;font-size:10px;font-weight:900;cursor:pointer}.d1-inspector-action.save{grid-column:1/-1;background:#222;color:#fff;border-color:#222}.d1-inspector-action.delete{color:#853838}.d1-board-mobile-tabs{display:none}.d1-board-board-status{color:#77736c;font-size:9px;font-weight:900}
  @media(max-width:1100px){.d1-board-shell{grid-template-columns:230px minmax(0,1fr) 270px}.drawflow .drawflow-node{width:245px}.d1-node-v2{width:213px}}
  @media(max-width:820px){.d1-board-shell{display:flex;position:relative}.d1-board-center{width:100%;flex:1}.d1-board-panel{position:absolute;inset:0 auto 0 0;z-index:25;width:min(88vw,330px);box-shadow:12px 0 35px #0003;transform:translateX(-105%);transition:transform .2s ease}.d1-board-panel.open{transform:translateX(0)}.d1-board-inspector{left:auto;right:0;transform:translateX(105%);box-shadow:-12px 0 35px #0003}.d1-board-inspector.open{transform:translateX(0)}.d1-board-mobile-tabs{display:flex;gap:6px}.d1-board-minimap{width:130px;height:88px}.d1-board-center-tools{overflow:auto}.d1-board-center-tools .left,.d1-board-center-tools .right{flex-wrap:nowrap}.d1-board-tool{white-space:nowrap}}
  `;
  document.head.append(style);
}

function cardDefinitions(){
  return [...document.querySelectorAll('.scene-card[data-entity-kind="scene"]')].map(card=>({
    id:card.dataset.entityId||card.dataset.scene,
    title:card.querySelector('.scene-title')?.textContent?.trim()||card.dataset.entityId,
    description:card.querySelector('.scene-desc')?.textContent?.trim()||'',
    source:card.querySelector('.scene-code')?.textContent?.trim()||'',
    mark:card.querySelector('.scene-preview-mark')?.textContent?.trim()||'□'
  })).filter(item=>item.id);
}
function requestDefinitions(){return (workspace()?.state?.requests||[]).map(item=>({id:Number(item.id),kind:item.kind,title:item.title,description:item.description||'',note:item.scenario||item.description||''}))}
function nodeMap(){return workspace()?.editor?.drawflow?.drawflow?.Home?.data||{}}
function nodeData(id){return nodeMap()[String(id)]||nodeMap()[Number(id)]||null}
function nodeCount(){return Object.keys(nodeMap()).length}
function existingSceneId(id){return Object.values(nodeMap()).find(node=>node.data?.sceneId===id)?.id||null}
function existingRequestId(id){return Object.values(nodeMap()).find(node=>Number(node.data?.requestId)===Number(id))?.id||null}
function sceneInfo(id){return cardDefinitions().find(item=>item.id===id)||null}
function requestInfo(id){return requestDefinitions().find(item=>Number(item.id)===Number(id))||null}
function kindMeta(data={}){
  const kind=String(data.kind||'note');
  if(kind==='scene')return{label:'مشهد منشور',className:'scene-node'};
  if(kind==='scenario')return{label:'سيناريو',className:'scenario-node'};
  if(kind==='decision')return{label:'قرار / تفرع',className:'decision-node'};
  if(kind.startsWith('request-'))return{label:kind==='request-scene'?'طلب مشهد':'طلب عنصر',className:'request-node'};
  return{label:'ملاحظة',className:'note-node'};
}
function normalizedModel(raw={}){
  const data={...(raw.data||raw)};
  const scene=data.kind==='scene'?sceneInfo(data.sceneId):null;
  const request=String(data.kind||'').startsWith('request-')?requestInfo(data.requestId):null;
  return{
    ...data,
    title:String(data.title||scene?.title||request?.title||(data.kind==='scenario'?'سيناريو جديد':data.kind==='decision'?'قرار جديد':'ملاحظة جديدة')),
    note:String(data.note||request?.note||scene?.description||''),
    source:String(data.source||scene?.source||''),
    mark:String(data.mark||scene?.mark||'•')
  };
}
function nodeHtml(model){
  const meta=kindMeta(model);
  const preview=model.kind==='scene'?`<button class="d1-preview" data-preview-scene="${esc(model.sceneId)}">معاينة المشهد</button>`:'';
  return `<div class="d1-node d1-node-v2"><div class="d1-node-v2-head"><em>${esc(meta.label)}</em><button class="d1-node-v2-menu" type="button" data-inspect-node title="خصائص العقدة">•••</button></div><strong>${esc(model.title)}</strong><p>${esc(model.note||'بدون ملاحظات بعد')}</p>${model.source?`<small>${esc(model.source)}</small>`:''}${preview}</div>`;
}
function setRawNode(id,model){
  const editor=workspace()?.editor,raw=nodeData(id);if(!editor||!raw)return;
  raw.data={...model};raw.html=nodeHtml(model);raw.class=kindMeta(model).className;
  editor.updateNodeDataFromId?.(String(id),raw.data);
  const element=document.getElementById(`node-${id}`),content=element?.querySelector('.drawflow_content_node');
  if(element){element.classList.remove('note-node','scenario-node','decision-node','request-node','scene-node');element.classList.add(kindMeta(model).className)}
  if(content)content.innerHTML=raw.html;
}
function hydrateNode(id){const raw=nodeData(id);if(!raw)return;setRawNode(id,normalizedModel(raw))}
function hydrateAll(){Object.keys(nodeMap()).forEach(hydrateNode);updatePalette();renderMinimap();updateBoardStatus()}
function nextPosition(){const count=nodeCount();return{x:90+(count%3)*340,y:80+Math.floor(count/3)*230}}
function addNode(model){
  const editor=workspace()?.editor;if(!editor)return null;
  const data=normalizedModel(model),meta=kindMeta(data),position=nextPosition();
  const id=editor.addNode(`${data.kind}-${Date.now()}`,1,1,position.x,position.y,meta.className,data,nodeHtml(data));
  workspace()?.boardSave?.();setTimeout(()=>{selectNode(id);updatePalette();renderMinimap()},30);return id;
}
function addScene(id){const existing=existingSceneId(id);if(existing){selectNode(existing);return}const scene=sceneInfo(id);if(scene)addNode({kind:'scene',sceneId:id,title:scene.title,note:scene.description,source:scene.source,mark:scene.mark})}
function addRequest(id){const existing=existingRequestId(id);if(existing){selectNode(existing);return}const request=requestInfo(id);if(request)addNode({kind:`request-${request.kind}`,requestId:request.id,title:request.title,note:request.note})}
function selectNode(id){
  const element=document.getElementById(`node-${id}`);if(!element)return;
  document.querySelectorAll('.drawflow-node.selected').forEach(node=>node.classList.remove('selected'));
  element.classList.add('selected');selectedNodeId=String(id);renderInspector();
  if(innerWidth<=820)document.getElementById('d1BoardInspector')?.classList.add('open');
}
function clearSelection(){selectedNodeId=null;document.querySelectorAll('.drawflow-node.selected').forEach(node=>node.classList.remove('selected'));renderInspector()}
function renderInspector(){
  const root=document.getElementById('d1InspectorBody');if(!root)return;
  const raw=selectedNodeId?nodeData(selectedNodeId):null;if(!raw){root.innerHTML='<div class="d1-inspector-empty">اختر عقدة من اللوحة.<br>ستظهر هنا الملاحظات والاسم وإجراءات المعاينة والحذف.</div>';return}
  const model=normalizedModel(raw),meta=kindMeta(model);
  root.innerHTML=`<form id="d1InspectorForm" class="d1-inspector-form"><div class="d1-inspector-type"><span>${esc(meta.label)}</span><b>#${esc(selectedNodeId)}</b></div><label class="d1-inspector-field"><span>اسم العقدة</span><input id="d1InspectorTitle" maxlength="140" value="${esc(model.title)}"></label><label class="d1-inspector-field"><span>الملاحظات داخل العقدة</span><textarea id="d1InspectorNote" maxlength="6000" placeholder="اكتب ما يحدث، المطلوب، أو سبب الربط…">${esc(model.note)}</textarea></label>${model.source?`<div class="d1-inspector-source">${esc(model.source)}</div>`:''}<div class="d1-inspector-actions"><button class="d1-inspector-action save" type="submit">حفظ وتحديث العقدة</button>${model.kind==='scene'?'<button id="d1InspectorPreview" class="d1-inspector-action" type="button">معاينة المشهد</button>':''}<button id="d1InspectorDuplicate" class="d1-inspector-action" type="button">نسخ العقدة</button><button id="d1InspectorDelete" class="d1-inspector-action delete" type="button">حذف العقدة</button></div></form>`;
  document.getElementById('d1InspectorForm').onsubmit=event=>{event.preventDefault();const next={...model,title:document.getElementById('d1InspectorTitle').value.trim()||model.title,note:document.getElementById('d1InspectorNote').value.trim()};setRawNode(selectedNodeId,next);workspace()?.boardSave?.();renderMinimap();updateBoardStatus('تم حفظ خصائص العقدة')};
  document.getElementById('d1InspectorPreview')?.addEventListener('click',()=>{document.getElementById('d1BoardClose')?.click();document.querySelector(`.scene-card[data-entity-id="${CSS.escape(model.sceneId)}"] .scene-open`)?.click()});
  document.getElementById('d1InspectorDuplicate').onclick=()=>addNode({...model,kind:model.kind==='scene'?'note':model.kind,title:`نسخة · ${model.title}`,sceneId:model.kind==='scene'?undefined:model.sceneId,source:model.kind==='scene'?'':model.source});
  document.getElementById('d1InspectorDelete').onclick=()=>{if(!confirm('حذف هذه العقدة من المخطط؟'))return;workspace()?.editor?.removeNodeId?.(`node-${selectedNodeId}`);clearSelection();workspace()?.boardSave?.();updatePalette();renderMinimap()};
}
function updateBoardStatus(message=''){
  const el=document.getElementById('d1BoardV2Status');if(!el)return;
  const connections=Object.values(nodeMap()).reduce((sum,node)=>sum+Object.values(node.outputs||{}).reduce((total,output)=>total+(output.connections?.length||0),0),0);
  el.textContent=message||`${nodeCount()} عقد · ${connections} روابط`;
}
function paletteItem(item,type){
  const existing=type==='scene'?existingSceneId(item.id):existingRequestId(item.id);
  return `<button class="d1-library-item" type="button" data-add-${type}="${esc(item.id)}" ${existing?'disabled':''}><span class="d1-library-mark">${esc(item.mark|| (type==='scene'?'□':'＋'))}</span><span class="d1-library-copy"><strong>${esc(item.title)}</strong><span>${esc(item.description||item.note||'')}</span></span><span class="d1-library-plus">${existing?'✓':'＋'}</span></button>`;
}
function updatePalette(){
  const sceneRoot=document.getElementById('d1SceneLibrary'),requestRoot=document.getElementById('d1RequestLibrary');if(!sceneRoot||!requestRoot)return;
  const query=(document.getElementById('d1BoardSearch')?.value||'').trim().toLowerCase();
  const scenes=cardDefinitions().filter(item=>`${item.title} ${item.description}`.toLowerCase().includes(query));
  const requests=requestDefinitions().filter(item=>`${item.title} ${item.description}`.toLowerCase().includes(query));
  sceneRoot.innerHTML=scenes.map(item=>paletteItem(item,'scene')).join('')||'<div class="d1-inspector-empty">لا توجد مشاهد مطابقة.</div>';
  requestRoot.innerHTML=requests.map(item=>paletteItem(item,'request')).join('')||'<div class="d1-inspector-empty">لا توجد طلبات حالية.</div>';
  document.getElementById('d1SceneCount').textContent=scenes.length;document.getElementById('d1RequestCount').textContent=requests.length;
}
function arrangeNodes(){
  const entries=Object.entries(nodeMap());if(!entries.length)return;
  const columns=entries.length>8?4:3;
  entries.forEach(([id,node],index)=>{const x=80+(index%columns)*330,y=80+Math.floor(index/columns)*225;node.pos_x=x;node.pos_y=y;const element=document.getElementById(`node-${id}`);if(element){element.style.left=`${x}px`;element.style.top=`${y}px`}});
  workspace()?.editor?.zoom_reset?.();workspace()?.boardSave?.();renderMinimap();updateBoardStatus('تم ترتيب العقد بوضوح');
}
function renderMinimap(){
  const root=document.getElementById('d1BoardMinimap');if(!root)return;
  const entries=Object.entries(nodeMap());if(!entries.length){root.innerHTML='<span class="d1-board-minimap-label">خريطة مصغرة</span>';return}
  const maxX=Math.max(...entries.map(([,node])=>Number(node.pos_x||0)+270),600),maxY=Math.max(...entries.map(([,node])=>Number(node.pos_y||0)+170),400);
  const rects=entries.map(([id,node])=>`<rect x="${Number(node.pos_x||0)}" y="${Number(node.pos_y||0)}" width="250" height="120" rx="18" fill="${String(id)===String(selectedNodeId)?'#222':'#c9c5bd'}" opacity="${String(id)===String(selectedNodeId)?'.9':'.65'}"/>`).join('');
  root.innerHTML=`<span class="d1-board-minimap-label">خريطة مصغرة</span><svg viewBox="0 0 ${maxX} ${maxY}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rects}</svg>`;
}
function bindEditor(){
  const editor=workspace()?.editor;if(!editor||editorBound)return;editorBound=true;
  ['nodeCreated','nodeRemoved','nodeMoved','connectionCreated','connectionRemoved','zoom','translate'].forEach(name=>editor.on?.(name,()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{hydrateAll();renderInspector()},70)}));
  editor.on?.('nodeSelected',id=>selectNode(id));editor.on?.('nodeUnselected',clearSelection);
  const canvas=document.getElementById('d1Canvas');canvas.addEventListener('click',event=>{const node=event.target.closest('.drawflow-node');if(node){selectNode(node.id.replace('node-',''));return}if(event.target.closest('[data-inspect-node]'))return;if(event.target===canvas||event.target.classList.contains('parent-drawflow'))clearSelection()});
  hydrateAll();
}
async function ensureBoard(){
  document.getElementById('d1BoardOpen')?.click();
  for(let attempt=0;attempt<100;attempt++){if(workspace()?.editor){bindEditor();return workspace().editor}await sleep(50)}
  return null;
}
function buildShell(){
  const overlay=document.getElementById('d1BoardOverlay'),wrap=overlay?.querySelector('.d1-canvas-wrap');if(!overlay||!wrap||document.getElementById('d1BoardShell'))return;
  const shell=document.createElement('div');shell.id='d1BoardShell';shell.className='d1-board-shell';
  const library=document.createElement('aside');library.id='d1BoardLibrary';library.className='d1-board-panel d1-board-library';library.innerHTML=`<header class="d1-board-panel-head"><strong>مكتبة العقد</strong><span>أضف عقدة ثم اربطها بصريًا. العقدة لا تغيّر منطق اللعبة.</span><input id="d1BoardSearch" class="d1-board-search" type="search" placeholder="ابحث عن مشهد أو طلب…"></header><section class="d1-board-section"><h3 class="d1-board-section-title"><span>عقد حرة</span><small>3</small></h3><div class="d1-board-quick"><button class="d1-board-add note" data-add-custom="note">＋ ملاحظة</button><button class="d1-board-add scenario" data-add-custom="scenario">＋ سيناريو</button><button class="d1-board-add decision" data-add-custom="decision">＋ قرار / تفرع</button></div></section><section class="d1-board-section"><h3 class="d1-board-section-title"><span>المشاهد</span><small id="d1SceneCount">0</small></h3><div id="d1SceneLibrary" class="d1-board-list"></div></section><section class="d1-board-section"><h3 class="d1-board-section-title"><span>الطلبات</span><small id="d1RequestCount">0</small></h3><div id="d1RequestLibrary" class="d1-board-list"></div></section>`;
  const center=document.createElement('main');center.className='d1-board-center';center.innerHTML=`<div class="d1-board-center-tools"><div class="left"><span id="d1BoardV2Status" class="d1-board-board-status">جاهز</span><div class="d1-board-mobile-tabs"><button id="d1MobileLibrary" class="d1-board-tool">مكتبة العقد</button><button id="d1MobileInspector" class="d1-board-tool">خصائص العقدة</button></div></div><div class="right"><button id="d1AddNoteTop" class="d1-board-tool primary">＋ عقدة جديدة</button><button id="d1Arrange" class="d1-board-tool">ترتيب واضح</button><button id="d1Hydrate" class="d1-board-tool">تحديث العرض</button><button id="d1ClearSelection" class="d1-board-tool">إلغاء التحديد</button></div></div>`;
  const inspector=document.createElement('aside');inspector.id='d1BoardInspector';inspector.className='d1-board-panel d1-board-inspector';inspector.innerHTML='<header class="d1-board-panel-head"><strong>خصائص العقدة</strong><span>عدّل الاسم والملاحظات من هنا بدل الكتابة داخل مساحة مزدحمة.</span></header><div id="d1InspectorBody"></div>';
  wrap.parentNode.insertBefore(shell,wrap);center.append(wrap);shell.append(library,center,inspector);
  const minimap=document.createElement('div');minimap.id='d1BoardMinimap';minimap.className='d1-board-minimap';wrap.append(minimap);
  overlay.querySelector('#d1Scenario')?.setAttribute('hidden','');overlay.querySelector('#d1Scenes')?.setAttribute('hidden','');
  document.getElementById('d1BoardSearch').addEventListener('input',updatePalette);
  library.addEventListener('click',event=>{const custom=event.target.closest('[data-add-custom]'),scene=event.target.closest('[data-add-scene]'),request=event.target.closest('[data-add-request]');if(custom){const kind=custom.dataset.addCustom;addNode({kind,title:kind==='scenario'?'سيناريو جديد':kind==='decision'?'قرار جديد':'ملاحظة جديدة',note:''})}else if(scene&&!scene.disabled)addScene(scene.dataset.addScene);else if(request&&!request.disabled)addRequest(request.dataset.addRequest)});
  document.getElementById('d1AddNoteTop').onclick=()=>addNode({kind:'note',title:'ملاحظة جديدة',note:''});document.getElementById('d1Arrange').onclick=arrangeNodes;document.getElementById('d1Hydrate').onclick=hydrateAll;document.getElementById('d1ClearSelection').onclick=clearSelection;
  document.getElementById('d1MobileLibrary').onclick=()=>library.classList.toggle('open');document.getElementById('d1MobileInspector').onclick=()=>inspector.classList.toggle('open');
  renderInspector();updatePalette();
}
async function start(){
  if(!/\/developer(?:\.html)?$/.test(location.pathname))return;
  injectStyles();
  for(let attempt=0;attempt<160;attempt++){if(workspace()&&document.getElementById('d1BoardOverlay'))break;await sleep(50)}
  if(!workspace()||!document.getElementById('d1BoardOverlay'))return;
  buildShell();
  document.getElementById('d1BoardOpen')?.addEventListener('click',async()=>{await sleep(20);for(let attempt=0;attempt<100&&!workspace()?.editor;attempt++)await sleep(50);bindEditor();hydrateAll()});
  document.getElementById('d1BoardOverlay')?.addEventListener('transitionend',()=>workspace()?.editor&&bindEditor());
  document.body.dataset.developerBoardV2='ready';
  globalThis.__yakolakD1BoardV2={ensureBoard,addNode,addScene,addRequest,arrangeNodes,selectNode};
  console.info('[Yakolak] D1 CLEAR THREE-PANEL SCENE BOARD LOADED',BOARD_V2_BUILD);
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',start,{once:true});else start();
