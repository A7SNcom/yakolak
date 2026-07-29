import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const requireTokens=(source,tokens,label)=>{
  for(const token of tokens)if(!source.includes(token))fail(`${label} missing ${token}`);
};
const uniqueIds=(items,label)=>{
  const ids=new Set();
  for(const item of items){
    if(!item?.id||ids.has(item.id))fail(`${label} invalid id ${item?.id||'missing'}`);
    ids.add(item.id);
  }
  return ids;
};

const html=read('developer.html');
const css=read('src/developer-president.css');
const ui=read('src/developer-president.js');
const api=read('api/developer-president.js');
const leadership=read('ops/ai-team/RASHED_LEADERSHIP_OS.md');
const teamOs=read('ops/ai-team/TEAM_OS.md');
const blueprint=JSON.parse(read('ops/ai-team/development-blueprint.json'));
const ledger=JSON.parse(read('ops/ai-team/development-ledger.json'));
const status=JSON.parse(read('ops/ai-team/president-status.json'));
const manifest=JSON.parse(read('src/president-portal-manifest.json'));

requireTokens(html,[
  'id="filters"','id="contentGrid"','id="contentModal"','id="mediaViewport"','id="comments"','id="commentForm"',
  'data-filter="scene"','data-filter="journey"','data-filter="element"','data-filter="task"'
],'minimal page');
for(const stale of ['president-kanban','presidentPortal','d4PreviewFrame','d4Drawer','developer-d4.js']){
  if(html.includes(stale))fail(`legacy interface remains in live page: ${stale}`);
}

requireTokens(css,[
  '.card-grid','.content-card','.content-modal','.media-arrow','.comments','.comment-form',
  '@media(max-width:700px)','@media(prefers-reduced-motion:reduce)','[hidden]{display:none!important}'
],'minimal styles');
requireTokens(ui,[
  "from './developer-d4-registry.js'",'function journeysFromScenes()','function mediaForItem(item)',
  'function renderComments()','function changeMedia(step)',"itemType:'content'","message.authorRole==='president'",
  "item.kind!=='task'","document.body.dataset.developerReady='true'"
],'card workspace');
requireTokens(api,["'directive','review','content'",'sameOrigin(req)',"author_role:'president'",'president_portal_disabled_in_production'],'conversation API');
if(api.includes("author_role:'manager'")||api.includes("'manager',text"))fail('browser API must not author Rashed messages');

requireTokens(leadership,['does **not** implement product code himself','Workers implement; reviewers challenge','President amendments'],'leadership contract');
requireTokens(teamOs,['Rashed is not an implementation worker','never becomes the product-code author'],'team contract');

if(blueprint.schemaVersion!==1||blueprint.revision!==5||!Array.isArray(blueprint.nodes)||!Array.isArray(blueprint.edges))fail('invalid blueprint revision');
const blueprintIds=uniqueIds(blueprint.nodes,'blueprint');
if(!blueprintIds.has('initiative-minimal-card-workspace'))fail('minimal card initiative missing');
if(blueprint.nodes.find(node=>node.id==='initiative-unified-president-workspace')?.status!=='superseded')fail('old workspace was not superseded');
for(const edge of blueprint.edges)if(!blueprintIds.has(edge.from)||!blueprintIds.has(edge.to))fail(`invalid edge ${edge.id}`);

if(ledger.schemaVersion!==1||ledger.revision!==5||!Array.isArray(ledger.initiatives)||!Array.isArray(ledger.tasks))fail('invalid ledger revision');
const initiativeIds=uniqueIds(ledger.initiatives,'initiatives');
const taskIds=uniqueIds(ledger.tasks,'tasks');
if(ledger.portfolio?.activeInitiativeId!=='initiative-minimal-card-workspace')fail('minimal initiative is not active');
if(!taskIds.has('YAK-008-01'))fail('YAK-008-01 missing');
for(const initiative of ledger.initiatives){
  if(!blueprintIds.has(initiative.blueprintNodeId))fail(`initiative ${initiative.id} references missing blueprint node`);
  for(const taskId of initiative.taskIds||[])if(!taskIds.has(taskId))fail(`initiative ${initiative.id} references missing task ${taskId}`);
}
for(const task of ledger.tasks){
  if(!initiativeIds.has(task.initiativeId)||!blueprintIds.has(task.blueprintNodeId))fail(`task ${task.id} has broken linkage`);
  if(!task.title||!task.outcome||!task.owner||!task.nextAction||!Array.isArray(task.acceptance)||!task.acceptance.length)fail(`task ${task.id} incomplete`);
}
if(status.blueprint?.canonicalRevision!==blueprint.revision||status.blueprint?.lastReconciledPresidentRevision!==blueprint.revision)fail('President status revision mismatch');
if(manifest.version!==3||manifest.views?.join(',')!=='cards'||manifest.conversationRoles?.join(',')!=='Ahmad,Rashed')fail('minimal runtime manifest mismatch');

console.log('Minimal cards, previews, Ahmad/Rashed conversation, and blueprint amendment verified.');
