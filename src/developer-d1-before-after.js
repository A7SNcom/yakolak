const COMPARISON_API='./api/developer-d1-comparisons';
const LOCAL_KEY='yakolak:developer-d1:before-after:v1';
const comparisons=new Map();
let remoteReady=false;

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function localRead(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}catch{return{}}}
function localSave(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(Object.fromEntries(comparisons)))}catch{}}
function normalizeUrl(value){
  const text=String(value||'').trim();
  if(!text)return'';
  let url;
  try{url=new URL(text,location.href)}catch{return''}
  return['http:','https:'].includes(url.protocol)?url.toString():'';
}
function previewUrl(item){
  if(!item||item.kind!=='thread')return'';
  const thread=item.value,url=new URL('./developer-scene.html',location.href);
  url.searchParams.set(thread.entityType==='element'?'element':'scene',thread.entityId);
  url.searchParams.set('preview','1');
  url.searchParams.set('d','D1');
  return url.toString();
}
function workspace(){return globalThis.__yakolakD1Workspace||null}
function itemForCard(card){
  const state=workspace()?.state;
  if(!state)return null;
  if(card.dataset.reviewThread){const value=state.threads.find(item=>String(item.id)===String(card.dataset.reviewThread));return value?{kind:'thread',id:String(value.id),value}:null}
  if(card.dataset.reviewRequest){const value=state.requests.find(item=>Number(item.id)===Number(card.dataset.reviewRequest));return value?{kind:'request',id:String(value.id),value}:null}
  return null;
}
function itemKey(item){return`${item.kind}:${item.id}`}
function injectStyles(){
  if(document.getElementById('d1BeforeAfterStyles'))return;
  const style=document.createElement('style');style.id='d1BeforeAfterStyles';style.textContent=`
  .review-compare{margin:0 14px 13px;border:1px solid #ddd;border-radius:16px;background:#f8f7f3;overflow:hidden}.review-compare>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 13px;cursor:pointer;font-size:11px;font-weight:950;list-style:none}.review-compare>summary::-webkit-details-marker{display:none}.review-compare>summary:after{content:'＋';font-size:15px}.review-compare[open]>summary:after{content:'−'}.compare-body{display:grid;gap:11px;padding:0 12px 12px;border-top:1px solid #e4e1db}.compare-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:12px}.compare-pane{min-width:0;border:1px solid #d8d5ce;border-radius:14px;background:#fff;overflow:hidden}.compare-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-bottom:1px solid #eee}.compare-pane-head strong{font-size:12px}.compare-pane-head span{font-size:9px;color:#777;font-weight:850}.compare-viewport{position:relative;aspect-ratio:16/10;background:#eceae5;overflow:hidden}.compare-viewport iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}.compare-empty{position:absolute;inset:0;display:grid;place-items:center;padding:18px;text-align:center;color:#777;font-size:11px;font-weight:850;line-height:1.6}.compare-pane-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;padding:9px}.compare-pane-controls input{min-width:0;width:100%;border:1px solid #ddd;border-radius:9px;padding:8px 9px;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;direction:ltr;text-align:left}.compare-open{border:1px solid #ddd;border-radius:9px;background:#fff;padding:7px 9px;font-size:10px;font-weight:900;cursor:pointer}.compare-open:disabled{opacity:.4;cursor:default}.compare-footer{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.compare-save,.compare-refresh,.compare-current{border:0;border-radius:10px;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer}.compare-save{background:#222;color:#fff}.compare-refresh{background:#e8e6e0}.compare-current{background:#e7eef4;color:#315b78}.compare-message{margin-inline-start:auto;color:#777;font-size:10px;font-weight:850}.compare-message.ok{color:#2f6b4f}.compare-message.warn{color:#91621f}
  @media(max-width:760px){.review-compare{margin-inline:10px}.compare-grid{grid-template-columns:1fr}.compare-footer{align-items:stretch}.compare-message{width:100%;margin:0}.compare-pane-controls{grid-template-columns:1fr}.compare-open{width:100%}}
  `;document.head.append(style);
}
function pane(label,hint,value,emptyText){
  const root=document.createElement('section');root.className='compare-pane';
  const head=document.createElement('header');head.className='compare-pane-head';head.innerHTML=`<strong>${esc(label)}</strong><span>${esc(hint)}</span>`;
  const viewport=document.createElement('div');viewport.className='compare-viewport';
  const frame=document.createElement('iframe');frame.title=`معاينة ${label}`;frame.loading='lazy';frame.referrerPolicy='no-referrer';frame.allow='fullscreen';frame.src='about:blank';
  const empty=document.createElement('div');empty.className='compare-empty';empty.textContent=emptyText;
  viewport.append(frame,empty);
  const controls=document.createElement('div');controls.className='compare-pane-controls';
  const input=document.createElement('input');input.type='url';input.dir='ltr';input.autocomplete='off';input.spellcheck=false;input.placeholder='ألصق رابط صورة أو فيديو أو صفحة';input.value=value||'';
  const open=document.createElement('button');open.type='button';open.className='compare-open';open.textContent='فتح';
  controls.append(input,open);root.append(head,viewport,controls);
  const apply=({load=false}={})=>{const url=normalizeUrl(input.value);input.value=url;empty.hidden=Boolean(url);open.disabled=!url;frame.dataset.src=url;if(!url)frame.src='about:blank';else if(load)frame.src=url;return url};
  open.onclick=()=>{const url=normalizeUrl(input.value);if(url)window.open(url,'_blank','noopener,noreferrer')};
  input.addEventListener('change',()=>apply({load:root.closest('details')?.open}));
  apply();
  return{root,input,frame,apply};
}
function decorateCard(card){
  if(card.querySelector(':scope > .review-compare'))return;
  const item=itemForCard(card);if(!item)return;
  const key=itemKey(item),saved=comparisons.get(key)||{},current=previewUrl(item);
  const details=document.createElement('details');details.className='review-compare';details.dataset.comparisonKey=key;
  const summary=document.createElement('summary');summary.innerHTML='<span>◫ معاينة قبل / بعد</span><small>مقارنة بصرية</small>';
  const body=document.createElement('div');body.className='compare-body';
  const grid=document.createElement('div');grid.className='compare-grid';
  const before=pane('قبل','الحالة السابقة',saved.beforeUrl||'','أضف رابط الحالة السابقة لتثبيتها هنا.');
  const after=pane('بعد','النسخة الحالية',saved.afterUrl||current||'',item.kind==='thread'?'تعذر تحديد رابط المشهد الحالي.':'أضف رابط النتيجة بعد تنفيذ الطلب.');
  grid.append(before.root,after.root);
  const footer=document.createElement('footer');footer.className='compare-footer';
  const save=document.createElement('button');save.type='button';save.className='compare-save';save.textContent='حفظ المقارنة';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='compare-refresh';refresh.textContent='↻ تحديث المعاينتين';
  const useCurrent=document.createElement('button');useCurrent.type='button';useCurrent.className='compare-current';useCurrent.textContent='استخدام المعاينة الحالية في «بعد»';useCurrent.hidden=!current;
  const message=document.createElement('span');message.className='compare-message';message.textContent=remoteReady?'الحفظ مشترك':'الحفظ المحلي متاح';
  footer.append(save,refresh,useCurrent,message);body.append(grid,footer);details.append(summary,body);
  const compose=card.querySelector(':scope > .review-compose');card.insertBefore(details,compose||null);
  details.addEventListener('toggle',()=>{if(details.open){before.apply({load:true});after.apply({load:true})}});
  refresh.onclick=()=>{for(const side of[before,after]){const url=side.apply();if(url){side.frame.src='about:blank';requestAnimationFrame(()=>side.frame.src=url)}}};
  useCurrent.onclick=()=>{after.input.value=current;after.apply({load:details.open});message.textContent='تم اختيار النسخة الحالية؛ اضغط حفظ';message.className='compare-message warn'};
  save.onclick=async()=>{
    const beforeUrl=before.apply({load:details.open}),afterUrl=after.apply({load:details.open});
    const comparison={itemKey:key,itemKind:item.kind,beforeUrl,afterUrl,updatedAt:new Date().toISOString()};
    comparisons.set(key,comparison);localSave();save.disabled=true;message.textContent='جارٍ الحفظ…';message.className='compare-message';
    try{
      const response=await fetch(COMPARISON_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',...comparison})});
      if(!response.ok)throw new Error(`comparison_${response.status}`);
      const data=await response.json();if(!data?.ok)throw new Error(data?.error||'comparison_invalid');
      comparisons.set(key,data.comparison);localSave();remoteReady=true;message.textContent='تم حفظ المقارنة للجميع';message.className='compare-message ok';
    }catch(error){console.warn('[Yakolak] D1 comparison local fallback',error);message.textContent='حُفظت محليًا؛ تعذر الحفظ المشترك';message.className='compare-message warn'}finally{save.disabled=false}
  };
}
function decorateAll(){document.querySelectorAll('#d1ReviewList > .review-card').forEach(decorateCard)}
async function loadComparisons(){
  Object.entries(localRead()).forEach(([key,value])=>comparisons.set(key,value));
  try{
    const response=await fetch(COMPARISON_API,{cache:'no-store'});if(!response.ok)throw new Error(`comparison_${response.status}`);
    const data=await response.json();if(!data?.ok||!Array.isArray(data.comparisons))throw new Error('comparison_invalid');
    data.comparisons.forEach(value=>comparisons.set(value.itemKey,value));remoteReady=true;localSave();
  }catch(error){console.info('[Yakolak] D1 comparisons using local state',error)}
}
async function start(){
  if(!/\/developer(?:\.html)?$/.test(location.pathname))return;
  injectStyles();await loadComparisons();
  for(let attempt=0;attempt<160;attempt++){
    const list=document.getElementById('d1ReviewList');if(list&&workspace()){decorateAll();new MutationObserver(()=>requestAnimationFrame(decorateAll)).observe(list,{childList:true});document.body.dataset.developerBeforeAfter='ready';console.info('[Yakolak] D1 BEFORE AFTER REVIEW PREVIEWS LOADED');return}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  console.warn('[Yakolak] D1 before/after preview could not find review center');
}

if(document.readyState==='loading')addEventListener('DOMContentLoaded',start,{once:true});else start();
