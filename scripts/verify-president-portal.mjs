import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const requireTokens=(source,tokens,label)=>{for(const token of tokens)if(!source.includes(token))fail(`${label} missing ${token}`)};
const uniqueIds=(items,label)=>{const ids=new Set();for(const item of items){if(!item?.id||ids.has(item.id))fail(`${label} invalid id ${item?.id||'missing'}`);ids.add(item.id)}return ids};

const html=read('developer.html'),css=read('src/developer-president.css'),ui=read('src/developer-president.js'),api=read('api/developer-president.js');
const leadership=read('ops/ai-team/RASHED_LEADERSHIP_OS.md'),teamOs=read('ops/ai-team/TEAM_OS.md');
const blueprint=JSON.parse(read('ops/ai-team/development-blueprint.json'));
const ledger=JSON.parse(read('ops/ai-team/development-ledger.json'));
const status=JSON.parse(read('ops/ai-team/president-status.json'));
const manifest=JSON.parse(read('src/president-portal-manifest.json'));

requireTokens(html,[
  'id="searchInput"','id="filters"','id="contentGrid"','id="openGlobalTask"','id="contentModal"','id="removeCurrent"',
  'id="previewItemSelect"','id="previewVersionSelect"','id="openLinkedTask"','id="linkedTasks"','id="editorModal"','contenteditable="true"',
  'accept="image/*,application/pdf,text/plain"','sortablejs@1.15.6/Sortable.min.js'
],'task page');
for(const stale of ['class="brand"','card-cover','mediaNext','mediaPrevious','id="comments"','id="commentForm"','president-kanban','d4PreviewFrame'])if(html.includes(stale))fail(`stale interface remains: ${stale}`);

requireTokens(css,['.content-card','.task-row','.drag-handle','.status-in_progress','.task-detail','.editor-content','.task-feed-tabs','.comment.worker','.preview-loading','.preview-frame.ready','.icon-button','@media(max-width:760px)','[hidden]{display:none!important}'],'task styles');
requireTokens(ui,[
  'function fuzzyScore(query,value)','function activateTaskSorting()','window.Sortable.create','function persistTaskOrder()','function updateTaskStatus(task,status)',
  "action:'task_reorder'","action:'task_status'","action:'task_delete'","action:'content_delete'","action:'task_comment'","action:'task_create'","action:'task_update'","action:'task_comment_update'",
  "['planned','in_progress','review','done']",'function filesToAttachments(fileList)','function previewSourcesFor(item)','function createWorkEntry(entry)','أحمد وراشد','الشغل',
  "state.current?.kind==='task'?removeTask(state.current):removeContent(state.current)"
],'task workflow');
requireTokens(api,[
  'yakolak_development_tasks','yakolak_development_task_state','yakolak_development_content_state','yakolak_development_task_comments','yakolak_development_task_work',
  "new Set(['planned','in_progress','review','done'])","action==='task_create'","action==='task_reorder'","action==='task_status'","action==='task_delete'","action==='content_delete'","action==='task_comment'",
  "action==='task_work_add'","action==='task_update'","action==='task_comment_update'","status==='in_progress'","status='planned'","actor==='manager'&&status==='done'",'protected_author_content','president_approval_required','RASHED_PORTAL_KEY','x-yakolak-manager-key','YAKOLAK_WORKER_KEY','x-yakolak-worker-key','cleanAttachments'
],'persistent task API');

requireTokens(leadership,['does **not** implement product code himself','Workers implement; reviewers challenge','President amendments'],'leadership contract');
requireTokens(teamOs,['Rashed is not an implementation worker','never becomes the product-code author'],'team contract');

if(blueprint.schemaVersion!==1||blueprint.revision!==8||!Array.isArray(blueprint.nodes)||!Array.isArray(blueprint.edges))fail('invalid blueprint revision');
const blueprintIds=uniqueIds(blueprint.nodes,'blueprint');
const minimalNode=blueprint.nodes.find(node=>node.id==='initiative-minimal-card-workspace');
if(!minimalNode||minimalNode.revision!==8||minimalNode.taskId!=='YAK-011')fail('editing amendment missing');
for(const edge of blueprint.edges)if(!blueprintIds.has(edge.from)||!blueprintIds.has(edge.to))fail(`invalid edge ${edge.id}`);

if(ledger.schemaVersion!==1||ledger.revision!==8||!Array.isArray(ledger.initiatives)||!Array.isArray(ledger.tasks))fail('invalid ledger revision');
const initiativeIds=uniqueIds(ledger.initiatives,'initiatives'),taskIds=uniqueIds(ledger.tasks,'tasks');
if(ledger.portfolio?.activeInitiativeId!=='initiative-minimal-card-workspace'||!taskIds.has('YAK-011-01'))fail('YAK-011 is not active');
if(ledger.tasks.find(task=>task.id==='YAK-009-01')?.status!=='superseded')fail('YAK-009 was not superseded');
if(ledger.tasks.find(task=>task.id==='YAK-008-01')?.status!=='superseded')fail('YAK-008 was not superseded');
for(const initiative of ledger.initiatives){if(!blueprintIds.has(initiative.blueprintNodeId))fail(`initiative ${initiative.id} has broken blueprint link`);for(const id of initiative.taskIds||[])if(!taskIds.has(id))fail(`initiative ${initiative.id} references missing task ${id}`)}
for(const task of ledger.tasks){if(!initiativeIds.has(task.initiativeId)||!blueprintIds.has(task.blueprintNodeId))fail(`task ${task.id} has broken linkage`);if(!task.title||!task.outcome||!task.owner||!task.nextAction||!Array.isArray(task.acceptance)||!task.acceptance.length)fail(`task ${task.id} incomplete`)}
if(status.blueprint?.canonicalRevision!==8||status.blueprint?.lastReconciledPresidentRevision!==8)fail('President status revision mismatch');
if(manifest.version!==6||manifest.editing?.join(',')!=='task,president-comment'||manifest.protectedEditing?.join(',')!=='manager-comment,work-entry'||manifest.previewLoading!=='parent-ready-message'||manifest.taskFeeds?.join(',')!=='president,work'||manifest.views?.join(',')!=='cards,ordered-tasks'||manifest.taskStatuses?.join(',')!=='planned,in_progress,review,done'||manifest.managerAuthentication!=='RASHED_PORTAL_KEY'||manifest.workerAuthentication!=='YAKOLAK_WORKER_KEY')fail('task runtime manifest mismatch');

console.log('Ordered tasks, delegated work feed, fuzzy search, attachments, previews, and President approval verified.');
