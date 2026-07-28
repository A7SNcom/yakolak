import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const requireTokens=(text,tokens,label)=>{for(const token of tokens)if(!text.includes(token))fail(`${label} missing ${token}`)};

const ui=read('src/developer-president.js');
const api=read('api/developer-president.js');
const manager=read('ops/ai-team/manager.md');
const leadership=read('ops/ai-team/RASHED_LEADERSHIP_OS.md');
const contract=read('ops/ai-team/PRESIDENT_PORTAL.md');
const teamOs=read('ops/ai-team/TEAM_OS.md');
const board=read('ops/ai-team/BOARD.md');
const outbox=JSON.parse(read('ops/ai-team/president-outbox.json'));
const status=JSON.parse(read('ops/ai-team/president-status.json'));
const blueprint=JSON.parse(read('ops/ai-team/development-blueprint.json'));
const manifest=JSON.parse(read('src/president-portal-manifest.json'));

requireTokens(ui,[
  "const API='./api/developer-president'",
  "gates.reviewer==='PASS'",
  "gates.manager==='PASS'",
  "gates.hakam==='MERGE_OK'",
  "gates.ci==='GREEN'",
  "document.body.dataset.developerRole='president'",
  "function wireSingleChannel()",
  "task.onclick=()=>openPortalFor('directives')",
  "review.onclick=()=>openPortalFor('reviews')"
],'President UI');

requireTokens(api,["'president'","directive_create","review_decision","sameOrigin(req)","PRESIDENT_PORTAL_PRODUCTION_ENABLED==='1'","president_portal_disabled_in_production"],'President API');
if(api.includes("author_role,body,created_at) VALUES(?,?,?,?,?,?)")&&api.includes("'manager'"))fail('browser API must not write manager role');

requireTokens(leadership,[
  'delegated executive deputy',
  'does **not** implement product code himself',
  'PRESIDENT_SIGNAL',
  'DELEGATED_LEADERSHIP',
  'PRESIDENT_RETURN',
  'President attention budget',
  'Workers implement; reviewers challenge'
],'Rashed leadership OS');

requireTokens(manager,[
  'RASHED_LEADERSHIP_OS.md',
  'DELEGATED_LEADERSHIP',
  'PRESIDENT_SIGNAL',
  'You never implement product code yourself',
  'president-outbox.json',
  'blueprint delta'
],'manager runbook');

requireTokens(contract,[
  'reviewer verdict is `PASS`',
  'Rashed personally inspected',
  'PRESIDENT_PORTAL_PRODUCTION_ENABLED',
  'President silence is not a blocker',
  'ACTION_NOW',
  'REVIEW_MILESTONE',
  'President return brief'
],'President contract');

requireTokens(teamOs,[
  'Rashed is not an implementation worker',
  'DELEGATED_LEADERSHIP',
  'Visual planning before implementation',
  'President attention budget',
  'never becomes the product-code author'
],'TEAM_OS');

requireTokens(board,[
  'Next strategic initiatives — to be delegated by Rashed, not implemented by the manager',
  'future-president-signal-summary',
  'future-editable-blueprint',
  'future-president-return-brief'
],'BOARD');

if(outbox.version!==1||!Array.isArray(outbox.items))fail('invalid President outbox');
if(status.version!==1||typeof status.directives!=='object'||Array.isArray(status.directives))fail('invalid President status file');
if(status.leadershipMode!=='DELEGATED_LEADERSHIP')fail('default Rashed leadership mode must be DELEGATED_LEADERSHIP');
if(!Number.isInteger(status.lastPresidentEventId)||status.lastPresidentEventId<0)fail('invalid President event cursor');
if(!status.blueprint||status.blueprint.canonicalRevision!==blueprint.revision)fail('President status blueprint revision mismatch');

if(blueprint.schemaVersion!==1||!Number.isInteger(blueprint.revision)||!Array.isArray(blueprint.nodes)||!Array.isArray(blueprint.edges))fail('invalid development blueprint');
const nodeIds=new Set(blueprint.nodes.map(node=>node.id));
for(const required of['goal-online-yakolak','leadership-delegated-rashed','track-visual-development','initiative-president-signal-cursor','initiative-editable-visual-blueprint','initiative-president-return-brief'])if(!nodeIds.has(required))fail(`blueprint missing ${required}`);
for(const edge of blueprint.edges)if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to))fail(`blueprint edge ${edge.id} references missing node`);

if(manifest.version!==1||manifest.humanRole!=='president'||manifest.manager!=='Rashed'||manifest.productionEnabledByDefault!==false)fail('invalid President runtime manifest');
for(const gate of['reviewer:PASS','manager:PASS','hakam:MERGE_OK','ci:GREEN','exact-head-preview'])if(!manifest.reviewGates?.includes(gate))fail(`manifest missing ${gate}`);

console.log('President portal and Rashed delegated-leadership contract verified');
