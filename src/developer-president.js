import {sceneDefinitions,elementDefinitions,variantsFor,contractFor} from './developer-d4-registry.js';

const API_URL='./api/developer-president';
const LEDGER_URL='./ops/ai-team/development-ledger.json';
const KIND_LABEL={scene:'مشهد',journey:'رحلة',element:'عنصر',task:'مهمة'};
const state={filter:'all',items:[],messages:[],current:null,media:[],mediaIndex:0,channelAvailable:false};

const grid=document.querySelector('#contentGrid');
const filters=document.querySelector('#filters');
const modal=document.querySelector('#contentModal');
const modalKind=document.querySelector('#modalKind');
const modalTitle=document.querySelector('#modalTitle');
const modalDescription=document.querySelector('#modalDescription');
const modalRelation=document.querySelector('#modalRelation');
const mediaSection=document.querySelector('#mediaSection');
const mediaViewport=document.querySelector('#mediaViewport');
const mediaNext=document.querySelector('#mediaNext');
const mediaPrevious=document.querySelector('#mediaPrevious');
const comments=document.querySelector('#comments');
const commentForm=document.querySelector('#commentForm');
const commentInput=document.querySelector('#commentInput');

function baseUrl(){return new URL('./',window.location.href).href}
function text(value){return String(value??'').trim()}
function safeUrl(value){
  if(!text(value))return'';
  try{
    const url=new URL(String(value||''),window.location.href);
    return ['http:','https:'].includes(url.protocol)?url.href:'';
  }catch{return''}
}
function unique(values){return [...new Set(values.filter(Boolean))]}
function contentItemId(item){return `content:${item.kind}:${item.id}`.replace(/[^a-zA-Z0-9:_-]/g,'-').slice(0,160)}

function journeysFromScenes(){
  return unique(sceneDefinitions.map(definition=>definition.journey)).map((name,index)=>{
    const scenes=sceneDefinitions.filter(definition=>definition.journey===name&&definition.type!=='sequence');
    return{
      id:`journey-${index+1}`,
      kind:'journey',
      title:`رحلة ${name}`,
      description:`${scenes.length} ${scenes.length===1?'مشهد':'مشاهد'}`,
      mark:'←',
      scenes
    };
  });
}

function taskRelation(task){
  const context=task.context&&typeof task.context==='object'?task.context:{};
  const value=text(task.scene||task.sceneId||context.scene||task.element||task.elementId||context.element||task.journey||task.journeyId||context.journey);
  return value;
}

function imageUrlsForTask(task){
  const evidence=Array.isArray(task.links?.evidence)?task.links.evidence:[];
  return unique([task.imageUrl,...evidence.map(entry=>entry?.url)]
    .map(safeUrl).filter(url=>/\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url)));
}

function taskItems(ledger){
  return (Array.isArray(ledger?.tasks)?ledger.tasks:[]).map(task=>({
    id:text(task.id)||`task-${crypto.randomUUID()}`,
    kind:'task',
    title:text(task.title)||'مهمة',
    description:text(task.outcome),
    relation:taskRelation(task),
    images:imageUrlsForTask(task),
    task
  }));
}

function buildItems(ledger){
  const scenes=sceneDefinitions.filter(definition=>definition.type!=='sequence').map(definition=>({
    id:definition.id,kind:'scene',title:definition.defaultName,description:definition.description,mark:definition.mark,definition
  }));
  const elements=elementDefinitions.map(definition=>({
    id:definition.id,kind:'element',title:definition.defaultName,description:definition.description,mark:definition.mark,definition
  }));
  return [...journeysFromScenes(),...scenes,...elements,...taskItems(ledger)];
}

function addCover(card,item){
  const taskImage=item.kind==='task'?item.images?.[0]:'';
  if(item.kind==='task'&&!taskImage)return;
  const cover=document.createElement('span');
  cover.className=`card-cover ${item.kind}`;
  if(taskImage){
    const image=document.createElement('img');
    image.src=taskImage;image.alt='';image.loading='lazy';
    cover.append(image);card.classList.add('has-media');
  }else{
    cover.textContent=text(item.mark)||KIND_LABEL[item.kind].slice(0,1);
  }
  card.append(cover);
}

function createCard(item){
  const card=document.createElement('button');
  card.type='button';card.className=`content-card ${item.kind}`;card.dataset.itemId=`${item.kind}:${item.id}`;
  addCover(card,item);
  const copy=document.createElement('span');copy.className='card-copy';
  const kind=document.createElement('span');kind.className='card-kind';kind.textContent=KIND_LABEL[item.kind];
  const title=document.createElement('span');title.className='card-title';title.textContent=item.title;
  copy.append(kind,title);
  if(item.description){const description=document.createElement('span');description.className='card-description';description.textContent=item.description;copy.append(description)}
  card.append(copy);
  card.addEventListener('click',()=>openItem(item));
  return card;
}

function renderGrid(){
  grid.replaceChildren();
  const visible=state.items.filter(item=>state.filter==='all'||item.kind===state.filter);
  if(!visible.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='لا توجد عناصر';grid.append(empty);return}
  grid.append(...visible.map(createCard));
}

function previewForDefinition(definition,variant){
  const contract=contractFor(definition,variant.id,baseUrl());
  return{type:'iframe',url:contract.previewUrl,title:variant.name||definition.defaultName};
}

function mediaForItem(item){
  if(item.kind==='scene'||item.kind==='element'){
    return variantsFor(item.definition).map(variant=>previewForDefinition(item.definition,variant));
  }
  if(item.kind==='journey'){
    return item.scenes.flatMap(definition=>{
      const variant=variantsFor(definition)[0];
      return variant?[previewForDefinition(definition,variant)]:[];
    });
  }
  const images=(item.images||[]).map(url=>({type:'image',url,title:item.title}));
  const preview=safeUrl(item.task?.links?.previewUrl);
  return preview?[...images,{type:'iframe',url:preview,title:item.title}]:images;
}

function renderMedia(){
  mediaViewport.replaceChildren();
  const current=state.media[state.mediaIndex];
  mediaSection.hidden=!current;
  if(!current)return;
  if(current.type==='image'){
    const image=document.createElement('img');image.src=current.url;image.alt=current.title||state.current.title;mediaViewport.append(image);
  }else{
    const frame=document.createElement('iframe');frame.src=current.url;frame.title=current.title||state.current.title;frame.loading='eager';mediaViewport.append(frame);
  }
  const multiple=state.media.length>1;
  mediaNext.hidden=!multiple;mediaPrevious.hidden=!multiple;
}

function rashedComments(item){
  if(item.kind!=='task')return[];
  return unique([text(item.task?.progress?.label),text(item.task?.nextAction)]).map((body,index)=>({
    id:`rashed-${index}`,authorRole:'manager',body
  }));
}

function itemComments(item){
  const id=contentItemId(item);
  const president=state.messages.filter(message=>message.itemType==='content'&&message.itemId===id&&message.authorRole==='president');
  return [...rashedComments(item),...president];
}

function createComment(entry){
  const isRashed=entry.authorRole==='manager';
  const row=document.createElement('article');row.className=`comment ${isRashed?'rashed':'ahmad'}`;
  const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=isRashed?'ر':'أ';
  const copy=document.createElement('div');copy.className='comment-copy';
  const name=document.createElement('span');name.className='comment-name';name.textContent=isRashed?'راشد':'أحمد';
  const body=document.createElement('p');body.className='comment-text';body.textContent=entry.body;
  copy.append(name,body);row.append(avatar,copy);return row;
}

function renderComments(){
  comments.replaceChildren(...itemComments(state.current).map(createComment));
  comments.hidden=!comments.childElementCount;
}

function openItem(item){
  state.current=item;state.media=mediaForItem(item);state.mediaIndex=0;
  modalKind.textContent=KIND_LABEL[item.kind];modalTitle.textContent=item.title;
  modalDescription.textContent=item.description;modalDescription.hidden=!item.description;
  modalRelation.textContent=item.relation||'';modalRelation.hidden=!item.relation;
  commentForm.hidden=!state.channelAvailable;commentInput.value='';
  renderMedia();renderComments();modal.showModal();
}

function changeMedia(step){
  if(state.media.length<2)return;
  state.mediaIndex=(state.mediaIndex+step+state.media.length)%state.media.length;
  renderMedia();
}

async function readJson(url){
  const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(`read_failed_${response.status}`);
  return response.json();
}

async function loadChannel(){
  try{
    const payload=await readJson(API_URL);
    state.messages=Array.isArray(payload.messages)?payload.messages:[];
    state.channelAvailable=Boolean(payload.ok);
  }catch{state.messages=[];state.channelAvailable=false}
}

async function postComment(body){
  const payload={action:'message_add',id:`msg-${Date.now()}-${crypto.randomUUID()}`,itemType:'content',itemId:contentItemId(state.current),body};
  const response=await fetch(API_URL,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.message)throw new Error('comment_failed');
  state.messages.push(result.message);
}

filters.addEventListener('click',event=>{
  const button=event.target.closest('[data-filter]');if(!button)return;
  state.filter=button.dataset.filter;
  filters.querySelectorAll('[data-filter]').forEach(candidate=>candidate.classList.toggle('active',candidate===button));
  renderGrid();
});
document.querySelector('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close()});
modal.addEventListener('close',()=>{mediaViewport.replaceChildren();state.current=null;state.media=[]});
mediaNext.addEventListener('click',()=>changeMedia(1));
mediaPrevious.addEventListener('click',()=>changeMedia(-1));
commentForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const body=text(commentInput.value);if(!body||!state.current)return;
  const button=commentForm.querySelector('button');button.disabled=true;
  try{await postComment(body);commentInput.value='';renderComments()}finally{button.disabled=false}
});

async function start(){
  const [ledger]=await Promise.all([readJson(LEDGER_URL).catch(()=>({tasks:[]})),loadChannel()]);
  state.items=buildItems(ledger);renderGrid();
  document.body.dataset.developerReady='true';
}

start();
