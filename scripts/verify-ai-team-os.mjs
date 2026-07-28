import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const errors=[];
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=relative=>fs.existsSync(path.join(root,relative));
const count=(text,needle)=>text.split(needle).length-1;
const clean=value=>String(value||'').replaceAll('`','').trim();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const field=(block,name)=>{
  const expression=new RegExp(`^- ${escape(name)}:\\s*(.*)$`,'m');
  const match=expression.exec(block);
  if(!match)return'';
  const inline=clean(match[1]);
  if(inline)return inline;
  const remainder=block.slice(match.index+match[0].length);
  const nextFieldIndex=remainder.search(/\n- [A-Z][^\n:]*:/);
  return clean(remainder.slice(0,nextFieldIndex<0?undefined:nextFieldIndex));
};

const TASK_SCHEMA_VERSION=2;
const semanticAliases={
  observed:['OBSERVED','Verified observations','Observed base/head','Required evidence'],
  outcome:['Single outcome','Objective'],
  why:['Why now'],
  base:['Base branch'],
  allowed:['Allowed scope','Allowed files'],
  forbidden:['Forbidden scope','Forbidden files / conflicts'],
  budget:['Change budget','Allowed scope'],
  acceptance:['Acceptance criteria'],
  validation:['Validation','Required validation'],
  reviewer:['Independent reviewer'],
  artifact:['Expected artifact'],
  stop:['Stop conditions']
};
const semanticField=(block,key)=>{
  for(const alias of semanticAliases[key]||[])if(field(block,alias))return field(block,alias);
  return'';
};
const missingSemantics=(block,{implementation=false}={})=>{
  const required=['observed','outcome','why','allowed','forbidden','budget','acceptance','validation','artifact','stop'];
  if(implementation)required.push('base','reviewer');
  return required.filter(key=>!semanticField(block,key));
};
const requireValue=(block,name,worker)=>{
  const value=field(block,name);
  if(!value)errors.push(`${worker}: missing ${name}`);
  return value;
};
const reviewerIdentity=value=>clean(value.split(/[,(]/)[0]).replace(/[.:;!?]+$/,'').trim();
const normalizeType=value=>({IMPLEMENT_PROCESS_GUARD:'IMPLEMENT',ARCHITECTURE_STEWARD:'REVIEW'}[value]||value);
const acceptedStatuses=new Set(['READY','HOLD','NO_TASK','READY_AFTER_ARTIFACT','READY_AFTER_REPORTS']);

const fixturePath='scripts/verify-ai-team-os-fixtures.json';
if(!exists(fixturePath))errors.push(`missing required file ${fixturePath}`);
else{
  const fixtures=JSON.parse(read(fixturePath));
  if(fixtures.schemaVersion!==TASK_SCHEMA_VERSION)errors.push(`fixture schema must be ${TASK_SCHEMA_VERSION}`);
  const positiveMissing=missingSemantics(fixtures.positive,{implementation:true});
  if(positiveMissing.length)errors.push(`positive semantic fixture missing ${positiveMissing.join(', ')}`);
  const negativeMissing=missingSemantics(fixtures.negative,{implementation:true});
  if(!negativeMissing.includes(fixtures.negativeMissing))errors.push(`negative semantic fixture must fail for ${fixtures.negativeMissing}`);
}

const configPath='ops/ai-team/team.config.json';
if(!exists(configPath))throw new Error(`Missing ${configPath}`);
const config=JSON.parse(read(configPath));
const workers=config.workers||[];
const workerSet=new Set(workers);

if(workerSet.size!==workers.length)errors.push('team.config.json has duplicate workers');
if(!workerSet.has(config.auditor))errors.push('auditor is not listed as a worker');
if(config.manager===config.auditor)errors.push('manager and auditor must be different');

const podWorkers=(config.pods||[]).flatMap(pod=>pod.workers||[]);
const podSet=new Set(podWorkers);
if(podSet.size!==podWorkers.length)errors.push('a worker appears in more than one pod');
if([...workerSet].some(worker=>!podSet.has(worker))||[...podSet].some(worker=>!workerSet.has(worker)))errors.push('pod membership must cover every worker exactly once');
if((config.pods||[]).length+1!==config.limits.activeAutomations)errors.push('manager + pod count must equal active automation limit');
const minutes=[config.managerMinute,...(config.pods||[]).map(pod=>pod.minute)];
if(new Set(minutes).size!==minutes.length)errors.push('schedule minutes must be unique');
if(minutes.some(minute=>!Number.isInteger(minute)||minute<0||minute>59))errors.push('schedule minutes must be integers from 0 to 59');

const requiredStatic=[
  'AGENTS.md','.github/copilot-instructions.md','.github/workflows/architecture-guardrails.yml',
  'docs/architecture/GAME_ARCHITECTURE.md','docs/architecture/MIGRATION_ROADMAP.md','docs/architecture/DEBT_REGISTER.md',
  'ops/ai-team/PROMPT_STANDARD.md','ops/ai-team/TEAM_OS.md','ops/ai-team/EVALUATION.md','ops/ai-team/PODS.md',
  'ops/ai-team/BOARD.md','ops/ai-team/HISTORY.md','ops/ai-team/manager.md','scripts/verify-architecture-guardrails.mjs',fixturePath
];
for(const file of requiredStatic)if(!exists(file))errors.push(`missing required file ${file}`);

const board=read('ops/ai-team/BOARD.md');
const boardCycle=clean(board.match(/^- Cycle:\s*(.+)$/m)?.[1]);
const boardStatus=clean(board.match(/^- Status:\s*(.+)$/m)?.[1]);
const freeze=/^PROCESS_FREEZE/.test(boardStatus);
const provenTier=/^- Capacity tier:\s*PROVEN\b/im.test(board);
if(!boardCycle)errors.push('BOARD.md has no active cycle');

let codeWriters=0;
let codePoints=0;
let nonCodeTasks=0;
const taskReviewers=[];

for(const worker of workers){
  const relative=`ops/ai-team/workers/${worker.toLowerCase()}.md`;
  if(!exists(relative)){errors.push(`missing worker file ${relative}`);continue}
  const text=read(relative);
  if(count(text,'<!-- MANAGER TASK:START -->')!==1||count(text,'<!-- MANAGER TASK:END -->')!==1)errors.push(`${worker}: manager task markers must appear exactly once`);
  if(count(text,'<!-- WORKER REPORT:START -->')!==1||count(text,'<!-- WORKER REPORT:END -->')!==1)errors.push(`${worker}: worker report markers must appear exactly once`);
  if(freeze){
    const expected=worker===config.auditor?'NO_CHANGE':'NO_TASK';
    const row=new RegExp(`\\|\\s*${escape(worker)}\\s*\\|\\s*\\\`${expected}\\\`\\s*\\|`);
    if(!row.test(board))errors.push(`${worker}: freeze board must declare ${expected}`);
    continue;
  }

  const task=text.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'';
  const cycle=requireValue(task,'Cycle',worker);
  const id=requireValue(task,'Task ID',worker);
  const status=requireValue(task,'Status',worker);
  if(cycle&&boardCycle&&cycle!==boardCycle)errors.push(`${worker}: cycle ${cycle} does not match board ${boardCycle}`);
  if(id&&!/^YAK-\d{3}-\d{2}$/.test(id))errors.push(`${worker}: invalid task id ${id}`);
  if(status&&!acceptedStatuses.has(status))errors.push(`${worker}: invalid status ${status}`);
  if(!board.includes(`| ${worker} |`))errors.push(`${worker}: missing from BOARD assignments/status table`);
  if(status==='NO_TASK')continue;

  const rawType=requireValue(task,'Task type',worker);
  const type=normalizeType(rawType);
  const effort=requireValue(task,'Effort',worker);
  requireValue(task,'Risk',worker);
  const implementation=config.implementationTypes.includes(type);
  for(const missing of missingSemantics(task,{implementation}))errors.push(`${worker}: missing semantic field ${missing} (schema v${TASK_SCHEMA_VERSION})`);

  if(type&&!config.allowedTaskTypes.includes(type))errors.push(`${worker}: invalid task type ${rawType}`);
  const effortMatch=effort.match(/^(XS|S|M)\s*\((\d+) points?\)$/i);
  if(!effortMatch){errors.push(`${worker}: invalid effort format ${effort}`);continue}
  const level=effortMatch[1].toUpperCase();
  const points=Number(effortMatch[2]);
  if(config.effortPoints[level]!==points)errors.push(`${worker}: ${level} must equal ${config.effortPoints[level]} points`);

  if(status!=='READY')continue;
  if(implementation){
    codeWriters+=1;
    codePoints+=points;
    const reviewer=semanticField(task,'reviewer');
    if(!reviewer||/^none\b/i.test(reviewer))errors.push(`${worker}: implementation requires an independent reviewer`);
    else taskReviewers.push({worker,reviewer});
  }else nonCodeTasks+=1;
}

for(const {worker,reviewer} of taskReviewers){
  const reviewerName=reviewerIdentity(reviewer);
  if(reviewerName===worker)errors.push(`${worker}: self-review is forbidden`);
  if(!workerSet.has(reviewerName))errors.push(`${worker}: unknown reviewer ${reviewerName}`);
  if(reviewerName===config.auditor)errors.push(`${worker}: auditor cannot replace the implementation reviewer`);
}

if(!freeze){
  const maxWriters=provenTier?config.limits.provenMaxCodeWritersPerCycle:config.limits.defaultMaxCodeWritersPerCycle;
  const maxPoints=provenTier?config.limits.provenMaxCodeEffortPointsPerCycle:config.limits.defaultMaxCodeEffortPointsPerCycle;
  if(codeWriters>maxWriters)errors.push(`code writers ${codeWriters} exceed ${provenTier?'proven':'default'} limit ${maxWriters}`);
  if(codePoints>maxPoints)errors.push(`code effort ${codePoints} exceeds ${provenTier?'proven':'default'} limit ${maxPoints}`);
  if(nonCodeTasks<config.limits.minimumIndependentNonCodeTasks)errors.push(`non-code tasks ${nonCodeTasks} below minimum ${config.limits.minimumIndependentNonCodeTasks}`);
}

const manager=read('ops/ai-team/manager.md');
if(!/sole manager/i.test(manager))errors.push('manager.md must declare one sole manager');
for(const keyword of ['NO_TASK','Architecture Steward','legacy-debt delta','migration-gate delta'])if(!manager.includes(keyword))errors.push(`manager.md missing ${keyword}`);
const auditorFile=read(`ops/ai-team/workers/${config.auditor.toLowerCase()}.md`);
if(!/independent cycle auditor/i.test(auditorFile)||!/permanently read-only/i.test(auditorFile))errors.push('auditor file must enforce independent read-only operation');
if(!freeze){
  const auditorTask=auditorFile.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'';
  if(normalizeType(field(auditorTask,'Task type'))!=='AUDIT')errors.push('auditor task type must be AUDIT');
}
const pods=read('ops/ai-team/PODS.md');
for(const worker of workers)if(!pods.includes(worker))errors.push(`PODS.md does not mention ${worker}`);
for(const keyword of ['NO_TASK','NO_CHANGE','scheduling'])if(!pods.includes(keyword))errors.push(`PODS.md missing ${keyword}`);
const teamOs=read('ops/ai-team/TEAM_OS.md');
for(const keyword of ['NO_TASK','Architecture Steward','legacy-debt delta','migration-gate delta','PROMPT_STANDARD.md'])if(!teamOs.includes(keyword))errors.push(`TEAM_OS.md missing ${keyword}`);
const evaluation=read('ops/ai-team/EVALUATION.md');
for(const keyword of ['tripwires','MERGE_OK','Manager score','Capability ledger','ARCH_REJECT'])if(!evaluation.toLowerCase().includes(keyword.toLowerCase()))errors.push(`EVALUATION.md missing ${keyword}`);
const promptStandard=read('ops/ai-team/PROMPT_STANDARD.md');
for(const keyword of ['OBSERVED','INFERRED','NO_TASK','Stop conditions'])if(!promptStandard.includes(keyword))errors.push(`PROMPT_STANDARD.md missing ${keyword}`);

if(errors.length){
  console.error(`AI Team OS verification failed with ${errors.length} error(s):`);
  for(const error of errors)console.error(`- ${error}`);
  process.exit(1);
}
const mode=freeze?`freeze ${boardStatus}`:`${codeWriters} code writers, ${codePoints} code points, ${nonCodeTasks} independent READY tasks`;
console.log(`AI Team OS verified: schema v${TASK_SCHEMA_VERSION}, ${workers.length} workers, ${config.pods.length} pods, ${mode}, cycle ${boardCycle}.`);
