console.info('[Yakolak] DEVELOPER D1 GALLERY LOADED');

const scenes=[
  {id:'loading-star',title:'مشهد التحميل',description:'النجمة المعتمدة بحركة الارتداد والانضغاط والظل.',type:'single',label:'مشهد واحد'},
  {id:'empty-table',title:'الغرفة والطاولة الفارغة',description:'المشهد الأساسي للغرفة مع الطاولة دون عناصر اللعب.',type:'single',label:'مشهد واحد'},
  {id:'logo-wall',title:'جدار الشعارات',description:'الجدار النهائي الذي يعرض شعاري ياكلك ومتكيّف.',type:'single',label:'مشهد واحد'},
  {id:'board-bases',title:'القاعدة والأربع قواعد',description:'تكوين ثابت للقاعدة الرئيسية والقواعد الأربع حولها.',type:'single',label:'مشهد واحد'},
  {id:'clean-entry',title:'رحلة الدخول النظيفة',description:'انتقال كامل من جدار التحميل إلى جدار الشعارات مرورًا بالطاولة.',type:'sequence',label:'مجموعة مشاهد'},
  {id:'unboxing-intro',title:'إنترو فك العلبة',description:'المشهد الحركي الكامل لفك العلبة وتجميع عناصر اللعبة.',type:'sequence',label:'مجموعة مشاهد'}
];

const tabs=[
  {id:'all',label:'كل المشاهد'},
  {id:'single',label:'مشهد واحد'},
  {id:'sequence',label:'مجموعة مشاهد'}
];

const grid=document.getElementById('sceneGrid');
const tabsRoot=document.getElementById('sceneTabs');
const count=document.getElementById('sceneCount');
const stage=document.getElementById('devStage');
const stageFrame=document.getElementById('devStageFrame');
const stageTitle=document.getElementById('devStageTitle');
const back=document.getElementById('devBack');
let activeFilter='all';

const previewObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    const iframe=entry.target.querySelector('iframe[data-src]');
    if(iframe&&!iframe.src.includes('developer-scene.html')){
      iframe.src=iframe.dataset.src;
      delete iframe.dataset.src;
    }
    previewObserver.unobserve(entry.target);
  });
},{rootMargin:'160px 0px',threshold:.08});

function sceneUrl(scene,preview=false){
  const url=new URL('./developer-scene.html',location.href);
  url.searchParams.set('scene',scene.id);
  if(preview)url.searchParams.set('preview','1');
  url.searchParams.set('d','D1');
  return url.toString();
}

function renderTabs(){
  tabsRoot.innerHTML='';
  tabs.forEach(tab=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='dev-tab'+(tab.id===activeFilter?' active':'');
    button.textContent=tab.label;
    button.dataset.filter=tab.id;
    button.setAttribute('aria-pressed',String(tab.id===activeFilter));
    button.onclick=()=>{
      activeFilter=tab.id;
      renderTabs();
      applyFilter();
    };
    tabsRoot.append(button);
  });
}

function cardFor(scene){
  const article=document.createElement('article');
  article.className='scene-card';
  article.dataset.type=scene.type;
  article.dataset.scene=scene.id;

  const preview=document.createElement('div');
  preview.className='scene-preview';
  const iframe=document.createElement('iframe');
  iframe.title=`معاينة ${scene.title}`;
  iframe.loading='lazy';
  iframe.src='about:blank';
  iframe.dataset.src=sceneUrl(scene,true);
  iframe.setAttribute('tabindex','-1');
  preview.append(iframe);

  const meta=document.createElement('div');
  meta.className='scene-meta';
  const copy=document.createElement('div');
  copy.className='scene-copy';
  const type=document.createElement('span');
  type.className='scene-type';
  type.textContent=scene.label;
  const title=document.createElement('h2');
  title.className='scene-title';
  title.textContent=scene.title;
  const desc=document.createElement('p');
  desc.className='scene-desc';
  desc.textContent=scene.description;
  copy.append(type,title,desc);

  const open=document.createElement('button');
  open.type='button';
  open.className='scene-open';
  open.setAttribute('aria-label',`فتح ${scene.title}`);
  open.textContent='↗';
  open.onclick=event=>{event.stopPropagation();openScene(scene)};
  meta.append(copy,open);
  article.append(preview,meta);
  article.onclick=()=>openScene(scene);
  article.tabIndex=0;
  article.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openScene(scene)}};
  previewObserver.observe(article);
  return article;
}

function renderCards(){
  previewObserver.disconnect();
  grid.innerHTML='';
  scenes.forEach(scene=>grid.append(cardFor(scene)));
  applyFilter();
}

function applyFilter(){
  let visible=0;
  grid.querySelectorAll('.scene-card').forEach(card=>{
    const show=activeFilter==='all'||card.dataset.type===activeFilter;
    card.hidden=!show;
    if(show){visible++;previewObserver.observe(card)}
  });
  count.textContent=`${visible} ${visible===1?'مشهد':'مشاهد'}`;
}

function openScene(scene){
  stageFrame.src=sceneUrl(scene,false);
  stageTitle.textContent=`D1 · ${scene.title}`;
  stage.classList.add('open');
  stage.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  back.focus({preventScroll:true});
  history.pushState({developerScene:scene.id},'',`#scene=${scene.id}`);
}

function closeScene({historyBack=false}={}){
  if(!stage.classList.contains('open'))return;
  stage.classList.remove('open');
  stage.setAttribute('aria-hidden','true');
  stageFrame.src='about:blank';
  document.body.style.overflow='';
  if(historyBack&&location.hash.startsWith('#scene='))history.back();
}

back.onclick=()=>closeScene({historyBack:true});
addEventListener('keydown',event=>{if(event.key==='Escape')closeScene({historyBack:true})});
addEventListener('popstate',()=>{if(!location.hash.startsWith('#scene='))closeScene()});

renderTabs();
renderCards();
document.body.dataset.developerBuild='D1';
