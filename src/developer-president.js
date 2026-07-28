const API='./api/developer-president';
const OUTBOX='./ops/ai-team/president-outbox.json';
const MANAGER_STATUS='./ops/ai-team/president-status.json';
const $=q=>document.querySelector(q);
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const uuid=prefix=>`${prefix}:${crypto.randomUUID()}`;
const state={directives:[],messages:[],decisions:[],outbox:[],managerStatus:{directives:{}},remote:false};
let activeTab='reviews';

function currentContext(){
  const title=$('#d4SelectionTitle')?.textContent?.trim()||document.title;
  const code=$('#d4SelectionCode')?.textContent?.trim()||'';
  return{title,code,url:location.href};
}
async function json(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});
  if(!response.ok)throw new Error(`${url}_${response.status}`);
  const data=await response.json();
  if(data?.ok===false)throw new Error(data.error||'invalid_response');
  return data;
}
const post=body=>json(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function formatTime(value){
  if(!value)return'—';
  try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch{return String(value)}
}
function decisionFor(id){return state.decisions.find(item=>item.reviewId===id)||null}
function messagesFor(type,id){return state.messages.filter(item=>item.itemType===type&&item.itemId===id)}
function managerState(id){return state.managerStatus?.directives?.[id]||{status:'new',note:'بانتظار قراءة راشد في الدورة القادمة.'}}
function eligible(item){
  const gates=item?.gates||{};
  return item?.status==='ready_for_president'
    && gates.reviewer==='PASS'
    && gates.manager==='PASS'
    && gates.hakam==='MERGE_OK'
    && gates.ci==='GREEN'
    && Boolean(item.previewUrl&&item.commitSha);
}
function eligibleReviews(){return state.outbox.filter(eligible)}
function pendingReviews(){return eligibleReviews().filter(item=>!decisionFor(item.id))}
function activeDirectives(){return state.directives.filter(item=>!item.cancelled&&!['completed','declined'].includes(managerState(item.id).status))}
function labelStatus(status){
  return({
    new:'جديدة لراشد',acknowledged:'استلمها راشد',planned:'مخططة',in_progress:'قيد التنفيذ',
    blocked:'متوقفة',ready_for_president:'عادت لمراجعتك',completed:'مكتملة',declined:'لم تُقبل',
    cancelled:'ملغاة',approved:'معتمدة',needs_changes:'تحتاج تعديل',rejected:'مرفوضة',ready:'بانتظار قرارك'
  })[status]||status;
}
function openPortalFor(tab='reviews'){
  activeTab=tab;
  openPortal();
  setTab(tab);
}
function wireSingleChannel(){
  for(const id of['#d4OpenQueue','#d4NewRequest']){
    const node=$(id);if(node){node.hidden=true;node.setAttribute('aria-hidden','true')}
  }
  const task=$('#d4StartTask');
  if(task){task.innerHTML='<span>كلّف راشد</span><small>تعليمات مرتبطة بالمشهد المفتوح</small>';task.onclick=()=>openPortalFor('directives')}
  const review=$('#d4ReviewOpen');
  if(review){review.querySelector('span').textContent='مراجعات راشد';review.onclick=()=>openPortalFor('reviews')}
  const brief=$('#d4BriefOpen');if(brief){brief.hidden=true;brief.setAttribute('aria-hidden','true')}
  for(const tab of document.querySelectorAll('[data-drawer-tab="task"],[data-drawer-tab="brief"]')){tab.hidden=true;tab.setAttribute('aria-hidden','true')}
  const mobileWork=document.querySelector('.d4-mobile-nav [data-mobile-view="work"]');
  if(mobileWork)mobileWork.onclick=event=>{event.preventDefault();openPortalFor('reviews')};
  const context=$('#d4ContextTitle');if(context)context.textContent='تواصل مع راشد من قناة واحدة';
}
function inject(){
  if($('#presidentPortal'))return;
  document.title='ياكلك · واجهة الرئيس';
  document.body.dataset.developerRole='president';
  const brand=document.querySelector('.d4-brand span');
  if(brand)brand.textContent='واجهة الرئيس · مساحة التطوير D4';
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./src/developer-president.css?v=President-v1';document.head.append(link);
  const actions=document.querySelector('.d4-header-actions');
  const button=document.createElement('button');
  button.id='d4PresidentOpen';button.className='d4-button ghost president-button';button.type='button';
  button.innerHTML='مكتب الرئيس <b id="d4PresidentCount" class="d4-count" hidden>0</b>';
  actions?.prepend(button);
  wireSingleChannel();
  document.body.insertAdjacentHTML('beforeend',`
  <section id="presidentPortal" class="president-overlay" aria-hidden="true">
    <header class="president-bar">
      <div class="president-brand"><span class="president-seal">ر</span><div><strong>مكتب الرئيس</strong><span>القناة الرسمية الوحيدة بينك وبين راشد، مدير فريق ياكلك.</span></div></div>
      <div class="president-actions"><span id="presidentSync" class="president-sync">جارٍ المزامنة</span><button id="presidentRefresh" class="d4-button ghost" type="button">تحديث</button><button id="presidentClose" class="d4-button primary" type="button">العودة</button></div>
    </header>
    <div class="president-shell">
      <nav class="president-nav">
        <div class="president-manager"><small>مدير الفريق</small><strong>راشد</strong><span>يرسل لك فقط الأعمال التي اجتازت المراجع والحَكَم وراجعها بنفسه.</span></div>
        <button class="president-tab active" type="button" data-president-tab="reviews">بانتظار قراري <b id="presidentReviewCount">0</b></button>
        <button class="president-tab" type="button" data-president-tab="directives">تعليماتي لراشد <b id="presidentDirectiveCount">0</b></button>
        <p class="president-nav-note">اعتمادك هنا لا ينشر Production تلقائيًا. النشر والقواعد والأسرار تبقى أوامر بشرية صريحة مستقلة.</p>
      </nav>
      <main class="president-main">
        <section id="presidentSummary" class="president-summary"></section>
        <section id="presidentReviews" class="president-section"></section>
        <section id="presidentDirectives" class="president-section" hidden></section>
      </main>
    </div>
  </section>`);
  button.onclick=()=>openPortalFor('reviews');
  $('#presidentClose').onclick=closePortal;
  $('#presidentRefresh').onclick=load;
  document.querySelectorAll('[data-president-tab]').forEach(tab=>tab.onclick=()=>setTab(tab.dataset.presidentTab));
  addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#presidentPortal')?.classList.contains('open'))closePortal()});
}
function openPortal(){
  $('#presidentPortal').classList.add('open');
  $('#presidentPortal').setAttribute('aria-hidden','false');
  load();
}
function closePortal(){
  $('#presidentPortal').classList.remove('open');
  $('#presidentPortal').setAttribute('aria-hidden','true');
}
function setTab(tab){
  activeTab=tab;
  document.querySelectorAll('[data-president-tab]').forEach(button=>button.classList.toggle('active',button.dataset.presidentTab===tab));
  $('#presidentReviews').hidden=tab!=='reviews';
  $('#presidentDirectives').hidden=tab!=='directives';
  render();
}
function renderCounts(){
  const pending=pendingReviews().length,active=activeDirectives().length,decided=eligibleReviews().filter(item=>decisionFor(item.id)).length;
  $('#presidentReviewCount').textContent=pending;
  $('#presidentDirectiveCount').textContent=active;
  $('#d4PresidentCount').textContent=pending;
  $('#d4PresidentCount').hidden=!pending;
  const hint=$('#d4ReviewHint');if(hint)hint.textContent=pending?`${pending} مراجعة مكتملة من راشد`:'لا توجد نتيجة مكتملة من راشد';
  $('#presidentSummary').innerHTML=`
    <article class="president-stat"><strong>${pending}</strong><span>مراجعات نهائية تنتظر قرارك</span></article>
    <article class="president-stat"><strong>${active}</strong><span>تعليمات مفتوحة عند راشد</span></article>
    <article class="president-stat"><strong>${decided}</strong><span>قرارات أصدرتها</span></article>`;
}
function evidenceLinks(item){
  const links=[];
  if(item.previewUrl)links.push(`<a href="${esc(item.previewUrl)}" target="_blank" rel="noopener noreferrer">فتح المعاينة ↗</a>`);
  if(item.prUrl)links.push(`<a href="${esc(item.prUrl)}" target="_blank" rel="noopener noreferrer">فتح PR ↗</a>`);
  for(const evidence of item.evidence||[])if(evidence?.url)links.push(`<a href="${esc(evidence.url)}" target="_blank" rel="noopener noreferrer">${esc(evidence.label||'دليل')} ↗</a>`);
  return links.join('');
}
function gateChips(item){
  const gates=item.gates||{};
  return[
    `المراجع: ${gates.reviewer||'—'}`,
    `راشد: ${gates.manager||'—'}`,
    `حَكَم: ${gates.hakam||'—'}`,
    `CI: ${gates.ci||'—'}`
  ].map(text=>`<span class="president-gate">${esc(text)}</span>`).join('');
}
function messageTimeline(type,id){
  const messages=messagesFor(type,id);
  if(!messages.length)return'';
  return`<div class="president-thread">${messages.map(message=>`<article class="president-message"><small>الرئيس · ${esc(formatTime(message.createdAt))}</small><p>${esc(message.body)}</p></article>`).join('')}</div>`;
}
function reviewCard(item){
  const decision=decisionFor(item.id),status=decision?.decision||'ready';
  const card=document.createElement('article');
  card.className=`president-card ${decision?'':'pending'} ${esc(status)}`;
  card.dataset.reviewId=item.id;
  card.innerHTML=`
    <header class="president-card-head"><div class="president-card-title"><strong>${esc(item.title)}</strong><span>${esc(item.taskId||item.id)} · أرسلها راشد ${esc(formatTime(item.createdAt))}</span></div><span class="president-status ${esc(status)}">${esc(labelStatus(status))}</span></header>
    <div class="president-card-body">
      <p>${esc(item.summary||'')}</p>
      <div class="president-gates">${gateChips(item)}</div>
      <div class="president-meta">
        <div><small>نفّذها</small><strong>${esc(item.worker||'—')}</strong></div>
        <div><small>راجعها</small><strong>${esc(item.reviewer||'—')}</strong></div>
        <div><small>Commit</small><strong>${esc(item.commitSha||'—')}</strong></div>
        <div><small>نطاق القرار</small><strong>${esc(item.decisionScope||'team_integration')}</strong></div>
      </div>
      <div class="president-links">${evidenceLinks(item)}</div>
      ${decision?.body?`<article class="president-message"><small>قرارك · ${esc(formatTime(decision.updatedAt))}</small><p>${esc(decision.body)}</p></article>`:''}
      ${messageTimeline('review',item.id)}
      <div class="president-compose"><textarea maxlength="12000" placeholder="اكتب ملاحظتك لراشد…">${decision?.body?esc(decision.body):''}</textarea><div class="president-row"><button class="president-action approve" data-decision="approved">اعتماد النتيجة</button><button class="president-action changes" data-decision="needs_changes">تحتاج تعديل</button><button class="president-action reject" data-decision="rejected">رفض</button><button class="president-action primary" data-message>إرسال ملاحظة فقط</button></div></div>
    </div>`;
  card.querySelectorAll('[data-decision]').forEach(button=>button.onclick=()=>saveReviewDecision(card,item,button.dataset.decision));
  card.querySelector('[data-message]').onclick=()=>addMessage(card,'review',item.id);
  return card;
}
async function saveReviewDecision(card,item,decision){
  const text=card.querySelector('textarea').value.trim();
  if(['needs_changes','rejected'].includes(decision)&&!text)return card.querySelector('textarea').focus();
  try{
    const data=await post({action:'review_decision',reviewId:item.id,decision,body:text});
    const index=state.decisions.findIndex(value=>value.reviewId===item.id);
    if(index>=0)state.decisions[index]=data.decision;else state.decisions.unshift(data.decision);
    render();
  }catch(error){console.error(error);$('#presidentSync').textContent='تعذر حفظ القرار'}
}
async function addMessage(card,itemType,itemId){
  const input=card.querySelector('textarea'),text=input.value.trim();
  if(!text)return input.focus();
  try{
    const data=await post({action:'message_add',id:uuid('message'),itemType,itemId,body:text});
    state.messages.push(data.message);input.value='';render();
  }catch(error){console.error(error);$('#presidentSync').textContent='تعذر إرسال الملاحظة'}
}
function directiveForm(){
  const context=currentContext();
  const section=document.createElement('form');
  section.className='president-form';
  section.innerHTML=`
    <div><strong>تكليف جديد لراشد</strong><p>اكتب الهدف والنتيجة المطلوبة. راشد يحولها إلى مهام صغيرة ويوزعها على الفريق.</p></div>
    <div class="president-form-grid">
      <label><span>عنوان التكليف</span><input name="title" maxlength="160" required placeholder="مثال: تحسين رحلة الدخول"></label>
      <label><span>النوع</span><select name="kind"><option value="instruction">تعليمات عامة</option><option value="scene">مشهد</option><option value="element">عنصر</option><option value="architecture">معمارية وتنظيم</option></select></label>
      <label><span>الأولوية</span><select name="priority"><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></label>
    </div>
    <label><span>ماذا تريد من راشد؟</span><textarea name="body" maxlength="12000" required placeholder="الهدف، السلوك المطلوب، وما الذي يجب أن يراجعه معك…"></textarea></label>
    <label><span><input name="linkContext" type="checkbox" checked> ربط بالمشهد أو العنصر المفتوح الآن</span></label>
    <div class="president-context">السياق الحالي: <b>${esc(context.title)}</b><br><code>${esc(context.code||'غير محدد')}</code></div>
    <button class="president-action primary" type="submit">إرسال إلى راشد</button>`;
  section.onsubmit=event=>submitDirective(event,section,context);
  return section;
}
async function submitDirective(event,form,context){
  event.preventDefault();
  const fields=new FormData(form);
  const body=String(fields.get('body')||'').trim(),title=String(fields.get('title')||'').trim();
  if(!title||!body)return;
  try{
    const data=await post({
      action:'directive_create',id:uuid('directive'),kind:String(fields.get('kind')),
      priority:String(fields.get('priority')),title,body,
      context:fields.get('linkContext')?context:{}
    });
    state.directives.unshift(data.directive);form.reset();render();
  }catch(error){console.error(error);$('#presidentSync').textContent='تعذر إرسال التكليف'}
}
function directiveCard(item){
  const manager=managerState(item.id),status=item.cancelled?'cancelled':manager.status||'new';
  const card=document.createElement('article');
  card.className=`president-card ${esc(status)}`;
  card.dataset.directiveId=item.id;
  card.innerHTML=`
    <header class="president-card-head"><div class="president-card-title"><strong>${esc(item.title)}</strong><span>${esc(item.kind)} · ${esc(item.priority)} · ${esc(formatTime(item.createdAt))}</span></div><span class="president-status ${esc(status)}">${esc(labelStatus(status))}</span></header>
    <div class="president-card-body">
      <p>${esc(item.body)}</p>
      ${item.context?.code?`<div class="president-context"><b>${esc(item.context.title)}</b><br><code>${esc(item.context.code)}</code></div>`:''}
      <article class="president-message"><small>راشد · ${esc(formatTime(manager.updatedAt))}</small><p>${esc(manager.note||'بانتظار قراءة راشد في الدورة القادمة.')}</p></article>
      ${manager.taskIds?.length?`<div class="president-gates">${manager.taskIds.map(id=>`<span class="president-gate">${esc(id)}</span>`).join('')}</div>`:''}
      ${messageTimeline('directive',item.id)}
      <div class="president-compose"><textarea maxlength="12000" placeholder="أضف توضيحًا لراشد…"></textarea><div class="president-row"><button class="president-action primary" data-message>إرسال توضيح</button>${!item.cancelled?'<button class="president-action reject" data-cancel>إلغاء التكليف</button>':''}</div></div>
    </div>`;
  card.querySelector('[data-message]').onclick=()=>addMessage(card,'directive',item.id);
  card.querySelector('[data-cancel]')?.addEventListener('click',()=>cancelDirective(item.id));
  return card;
}
async function cancelDirective(id){
  try{
    const data=await post({action:'directive_cancel',directiveId:id});
    const index=state.directives.findIndex(item=>item.id===id);
    if(index>=0)state.directives[index]=data.directive;
    render();
  }catch(error){console.error(error);$('#presidentSync').textContent='تعذر إلغاء التكليف'}
}
function renderReviews(){
  const root=$('#presidentReviews');root.innerHTML='';
  const items=eligibleReviews();
  if(!items.length){root.innerHTML='<div class="president-empty">لا توجد نتيجة اجتازت جميع البوابات وتنتظر قرارك الآن.</div>';return}
  items.forEach(item=>root.append(reviewCard(item)));
}
function renderDirectives(){
  const root=$('#presidentDirectives');root.innerHTML='';root.append(directiveForm());
  if(!state.directives.length){root.insertAdjacentHTML('beforeend','<div class="president-empty">لم ترسل تعليمات إلى راشد بعد.</div>');return}
  state.directives.forEach(item=>root.append(directiveCard(item)));
}
function render(){
  if(!$('#presidentPortal'))return;
  renderCounts();renderReviews();renderDirectives();
  $('#presidentReviews').hidden=activeTab!=='reviews';
  $('#presidentDirectives').hidden=activeTab!=='directives';
}
async function load(){
  $('#presidentSync').textContent='جارٍ المزامنة';
  try{
    const [channel,outbox,status]=await Promise.all([
      json(API),json(OUTBOX),json(MANAGER_STATUS)
    ]);
    state.directives=channel.directives||[];
    state.messages=channel.messages||[];
    state.decisions=channel.decisions||[];
    state.outbox=outbox.items||[];
    state.managerStatus=status||{directives:{}};
    state.remote=true;
    $('#presidentSync').textContent='متصل براشد';
  }catch(error){
    console.warn('[Yakolak] President portal load failed',error);
    $('#presidentSync').textContent='تعذر المزامنة';
  }
  render();
}
inject();
load();
window.__yakolakPresidentPortal={open:openPortal,refresh:load,currentContext};
