import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const includes=(text,tokens,label)=>{for(const token of tokens)if(!text.includes(token))fail(`${label} missing ${token}`)};

const ui=read('src/developer-president.js');
const blueprintUi=read('src/developer-blueprint.js');
const api=read('api/developer-president.js');
const html=read('developer.html');
const manager=read('ops/ai-team/manager.md');
const contract=read('ops/ai-team/PRESIDENT_PORTAL.md');
const agents=read('AGENTS.md');
const prompts=read('ops/ai-team/PROMPT_STANDARD.md');
const team=read('ops/ai-team/TEAM_OS.md');
const evaluation=read('ops/ai-team/EVALUATION.md');
const outbox=JSON.parse(read('ops/ai-team/president-outbox.json'));
const status=JSON.parse(read('ops/ai-team/president-status.json'));
const blueprint=JSON.parse(read('ops/ai-team/development-blueprint.json'));

includes(ui,["const API='./api/developer-president'","gates.reviewer==='PASS'","gates.manager==='PASS'","gates.hakam==='MERGE_OK'","gates.ci==='GREEN'","document.body.dataset.developerRole='president'","wireSingleChannel"],'President UI');
includes(api,["summary||''","activitySummary","hasNewPresidentInput","blueprint_save","blueprint_conflict","updated_by='president'","sameOrigin(req)"],'President API');
includes(blueprintUi,["const CANONICAL='./ops/ai-team/development-blueprint.json'","البرمجة بعد التوثيق","action:'blueprint_save'","expectedVersion","baseRevision","سيصبح عمل راشد القديم متوقفًا"],'Blueprint UI');
includes(html,['developer-president.js','developer-blueprint.js'],'developer.html');
includes(manager,['?summary=1&after=<lastPresidentEventId>','do not fetch or reanalyse the full channel','Programming after documentation','blueprintNodeId','blueprintRevision','pause ordinary backlog initiative'],'manager runbook');
includes(contract,['The President may use the portal many times in one day or only once','Programming after documentation','optimistic concurrency','blueprintNodeId','Rashed personally inspected'],'President contract');
includes(agents,['Documentation-first gate','BLOCKED: president blueprint changed','blueprintNodeId'],'AGENTS');
includes(prompts,['Visual blueprint reference','blueprintNodeId','unread President change'],'prompt standard');
includes(team,['Lightweight President checkpoint','visual blueprint node','President is asynchronous'],'TEAM_OS');
includes(evaluation,['coding without a valid canonical','unread/unreconciled President blueprint edit','Blueprint quality'],'evaluation');

if(api.includes("author_role,body,created_at) VALUES(?,?,?,?,?,?)")&&api.includes("'manager'"))fail('browser API must not write manager role');
if(blueprintUi.includes('post(CANONICAL'))fail('browser must not write canonical GitHub blueprint');
if(outbox.version!==2||!Array.isArray(outbox.items))fail('invalid President outbox v2');
if(status.version!==2||!Number.isInteger(status.lastPresidentEventId)||typeof status.directives!=='object'||Array.isArray(status.directives))fail('invalid President status v2');
if(blueprint.schemaVersion!==1||!Number.isInteger(blueprint.revision)||!Array.isArray(blueprint.nodes)||!Array.isArray(blueprint.edges))fail('invalid canonical blueprint');
const nodeIds=new Set(blueprint.nodes.map(node=>node.id));
if(!nodeIds.has('goal-online-yakolak')||!nodeIds.has('track-visual-development'))fail('canonical blueprint missing north-star nodes');
for(const edge of blueprint.edges)if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to))fail(`blueprint edge ${edge.id} references missing node`);
console.log('President async channel and visual blueprint contract verified');
