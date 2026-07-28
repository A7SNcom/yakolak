import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const ui=read('src/developer-president.js');
const api=read('api/developer-president.js');
const manager=read('ops/ai-team/manager.md');
const contract=read('ops/ai-team/PRESIDENT_PORTAL.md');
const outbox=JSON.parse(read('ops/ai-team/president-outbox.json'));
const status=JSON.parse(read('ops/ai-team/president-status.json'));

for(const token of[
  "const API='./api/developer-president'",
  "gates.reviewer==='PASS'",
  "gates.manager==='PASS'",
  "gates.hakam==='MERGE_OK'",
  "gates.ci==='GREEN'",
  "document.body.dataset.developerRole='president'",
  "function wireSingleChannel()",
  "task.onclick=()=>openPortalFor('directives')",
  "review.onclick=()=>openPortalFor('reviews')"
])if(!ui.includes(token))fail(`UI missing ${token}`);
for(const token of["'president'","directive_create","review_decision","sameOrigin(req)"])if(!api.includes(token))fail(`API missing ${token}`);
if(api.includes("author_role,body,created_at) VALUES(?,?,?,?,?,?)")&&api.includes("'manager'"))fail('browser API must not write manager role');
if(!manager.includes('PRESIDENT_PORTAL.md')||!manager.includes('president-outbox.json'))fail('manager runbook is not wired to President portal');
if(!contract.includes('reviewer verdict is `PASS`')||!contract.includes('Rashed personally inspected'))fail('review gate contract incomplete');
if(outbox.version!==1||!Array.isArray(outbox.items))fail('invalid President outbox');
if(status.version!==1||typeof status.directives!=='object'||Array.isArray(status.directives))fail('invalid President status file');
console.log('President portal contract verified');
