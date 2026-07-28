import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fail = message => { throw new Error(`[president-portal] ${message}`); };
const requireTokens = (text, tokens, label) => {
  for (const token of tokens) if (!text.includes(token)) fail(`${label} missing ${token}`);
};
const requireAnyToken = (text, tokens, label) => {
  if (!tokens.some(token => text.includes(token))) fail(`${label} missing one of: ${tokens.join(' | ')}`);
};
const uniqueIds = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) fail(`${label} item missing id`);
    if (seen.has(item.id)) fail(`${label} duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
};

const ui = read('src/developer-president.js');
const api = read('api/developer-president.js');
const manager = read('ops/ai-team/manager.md');
const leadership = read('ops/ai-team/RASHED_LEADERSHIP_OS.md');
const contract = read('ops/ai-team/PRESIDENT_PORTAL.md');
const visibility = read('ops/ai-team/DEVELOPMENT_VISIBILITY.md');
const teamOs = read('ops/ai-team/TEAM_OS.md');
const board = read('ops/ai-team/BOARD.md');
const outbox = JSON.parse(read('ops/ai-team/president-outbox.json'));
const status = JSON.parse(read('ops/ai-team/president-status.json'));
const blueprint = JSON.parse(read('ops/ai-team/development-blueprint.json'));
const ledger = JSON.parse(read('ops/ai-team/development-ledger.json'));
const manifest = JSON.parse(read('src/president-portal-manifest.json'));

requireTokens(ui, [
  "const API = './api/developer-president'",
  "const BLUEPRINT = './ops/ai-team/development-blueprint.json'",
  "const LEDGER = './ops/ai-team/development-ledger.json'",
  "gates.reviewer === 'PASS'",
  "gates.manager === 'PASS'",
  "gates.hakam === 'MERGE_OK'",
  "gates.ci === 'GREEN'",
  "document.body.dataset.developerRole = 'president'",
  'function wireSingleChannel()',
  "openPortalFor('directives')",
  "openPortalFor('reviews')",
  "data-president-tab=\"portfolio\"",
  "data-president-tab=\"tasks\"",
  "data-president-tab=\"timeline\"",
  'function renderBlueprintMap()',
  'function taskCard(task)',
  'function renderTimeline()',
  'Promise.allSettled'
], 'President UI');

requireTokens(api, [
  "'president'",
  'directive_create',
  'review_decision',
  'sameOrigin(req)',
  "PRESIDENT_PORTAL_PRODUCTION_ENABLED==='1'",
  'president_portal_disabled_in_production'
], 'President API');
if (api.includes("author_role,body,created_at) VALUES(?,?,?,?,?,?)") && api.includes("'manager'")) fail('browser API must not write manager role');

requireTokens(leadership, [
  'delegated executive deputy',
  'does **not** implement product code himself',
  'PRESIDENT_SIGNAL',
  'DELEGATED_LEADERSHIP',
  'PRESIDENT_RETURN',
  'Development visibility law',
  'event-driven, not hourly ceremony',
  'initiative containing several XS/S/M tasks',
  'Workers implement; reviewers challenge'
], 'Rashed leadership OS');

requireTokens(manager, [
  'RASHED_LEADERSHIP_OS.md',
  'DEVELOPMENT_VISIBILITY.md',
  'development-ledger.json',
  'DELEGATED_LEADERSHIP',
  'PRESIDENT_SIGNAL',
  'You never implement product code yourself',
  'Update it only when meaningful state changes',
  'No change means no new event',
  'ledger delta',
  'president-outbox.json'
], 'manager runbook');

requireTokens(contract, [
  'One linked project view',
  '**Project**',
  '**Tasks**',
  '**Timeline**',
  'event-driven checkpoints',
  'President silence is neither a blocker',
  'Rashed personally inspected',
  'PRESIDENT_PORTAL_PRODUCTION_ENABLED'
], 'President contract');

requireTokens(visibility, [
  'President intent → blueprint initiative',
  'Event-driven reporting',
  'Multi-cycle tasks',
  'Rashed is the only normal writer',
  'Project map',
  'Timeline'
], 'visibility contract');

requireTokens(teamOs, [
  'Rashed is not an implementation worker',
  'DELEGATED_LEADERSHIP',
  'Visual planning before implementation',
  'President attention budget',
  'never becomes the product-code author'
], 'TEAM_OS');

requireAnyToken(board, ['Executive deputy / sole manager: Rashed', 'Delegated executive / sole manager: Rashed'], 'BOARD manager identity');
requireAnyToken(board, ['Visual/documented initiative map', 'Canonical visual blueprint'], 'BOARD visual planning');
requireAnyToken(board, ['Workers implement', 'Implementation writers'], 'BOARD execution ownership');

if (outbox.version !== 1 || !Array.isArray(outbox.items)) fail('invalid President outbox');
if (status.version !== 1 || typeof status.directives !== 'object' || Array.isArray(status.directives)) fail('invalid President status file');
if (status.leadershipMode !== 'DELEGATED_LEADERSHIP') fail('default Rashed leadership mode must be DELEGATED_LEADERSHIP');
if (!Number.isInteger(status.lastPresidentEventId) || status.lastPresidentEventId < 0) fail('invalid President event cursor');
if (!status.blueprint || status.blueprint.canonicalRevision !== blueprint.revision) fail('President status blueprint revision mismatch');

if (blueprint.schemaVersion !== 1 || !Number.isInteger(blueprint.revision) || !Array.isArray(blueprint.nodes) || !Array.isArray(blueprint.edges)) fail('invalid development blueprint');
const blueprintNodeIds = uniqueIds(blueprint.nodes, 'blueprint nodes');
for (const required of ['goal-online-yakolak', 'leadership-delegated-rashed', 'track-visual-development']) {
  if (!blueprintNodeIds.has(required)) fail(`blueprint missing ${required}`);
}
for (const edge of blueprint.edges) {
  if (!edge.id || !blueprintNodeIds.has(edge.from) || !blueprintNodeIds.has(edge.to)) fail(`invalid blueprint edge ${edge.id || 'unknown'}`);
}

if (ledger.schemaVersion !== 1 || !Number.isInteger(ledger.revision) || !Array.isArray(ledger.initiatives) || !Array.isArray(ledger.tasks)) fail('invalid development ledger');
if (!ledger.portfolio?.leadershipMode || !ledger.portfolio?.summary || !ledger.portfolio?.nextManagementAction) fail('ledger portfolio summary incomplete');
const initiativeIds = uniqueIds(ledger.initiatives, 'ledger initiatives');
const taskIds = uniqueIds(ledger.tasks, 'ledger tasks');
if (!initiativeIds.has(ledger.portfolio.activeInitiativeId)) fail('ledger active initiative is missing');

for (const initiative of ledger.initiatives) {
  if (!blueprintNodeIds.has(initiative.blueprintNodeId)) fail(`initiative ${initiative.id} references missing blueprint node`);
  if (!initiative.title || !initiative.outcome || !initiative.status || !initiative.owner || !initiative.recommendation) fail(`initiative ${initiative.id} incomplete`);
  for (const taskId of initiative.taskIds || []) if (!taskIds.has(taskId)) fail(`initiative ${initiative.id} references missing task ${taskId}`);
}

const requiredGates = ['artifact', 'reviewer', 'architecture', 'hakam', 'ci', 'preview', 'manager', 'president'];
for (const task of ledger.tasks) {
  if (!initiativeIds.has(task.initiativeId)) fail(`task ${task.id} references missing initiative`);
  if (!blueprintNodeIds.has(task.blueprintNodeId)) fail(`task ${task.id} references missing blueprint node`);
  if (!Number.isInteger(task.blueprintRevision) || task.blueprintRevision < 1 || task.blueprintRevision > blueprint.revision) fail(`task ${task.id} has invalid blueprint revision`);
  if (!task.title || !task.outcome || !task.status || !task.owner || !task.nextAction || !task.presidentAttention) fail(`task ${task.id} incomplete`);
  if (!task.progress || !Number.isFinite(task.progress.completed) || !Number.isFinite(task.progress.total) || task.progress.total < 1 || task.progress.completed < 0 || task.progress.completed > task.progress.total) fail(`task ${task.id} progress invalid`);
  if (!Array.isArray(task.acceptance) || !task.acceptance.length) fail(`task ${task.id} missing acceptance criteria`);
  if (!Array.isArray(task.events) || !task.events.length) fail(`task ${task.id} missing event history`);
  uniqueIds(task.events, `task ${task.id} events`);
  for (const gate of requiredGates) if (!(gate in (task.gates || {}))) fail(`task ${task.id} missing gate ${gate}`);
  for (const event of task.events) if (!event.at || !event.type || !event.actor || !event.title || !event.detail) fail(`task ${task.id} has incomplete event ${event.id}`);
}

if (!ledger.tasks.some(task => task.blueprintNodeId === 'track-visual-development')) fail('ledger must expose President development OS work');
if (!ledger.tasks.some(task => task.status === 'in_progress')) fail('ledger must expose current in-progress delegated work');

if (manifest.version !== 2 || manifest.humanRole !== 'president' || manifest.manager !== 'Rashed' || manifest.productionEnabledByDefault !== false) fail('invalid President runtime manifest');
if (manifest.blueprint !== './ops/ai-team/development-blueprint.json' || manifest.ledger !== './ops/ai-team/development-ledger.json') fail('manifest project sources mismatch');
for (const view of ['portfolio', 'tasks', 'timeline', 'reviews', 'directives']) if (!manifest.views?.includes(view)) fail(`manifest missing view ${view}`);
if (manifest.reportingCadence !== 'meaningful-event') fail('manifest reporting cadence must be meaningful-event');
for (const gate of ['reviewer:PASS', 'manager:PASS', 'hakam:MERGE_OK', 'ci:GREEN', 'exact-head-preview']) if (!manifest.reviewGates?.includes(gate)) fail(`manifest missing ${gate}`);

console.log('President portal, visible development ledger, and Rashed leadership contract verified');