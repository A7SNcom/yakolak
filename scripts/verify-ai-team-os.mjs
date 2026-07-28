import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd(),errors=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const clean=value=>String(value||'').replaceAll('`','').trim();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const count=(text,needle)=>text.split(needle).length-1;
const field=(block,name)=>{
  const match=new RegExp(`^- ${escape(name)}:\\s*(.*)$`,'m').exec(block);
  if(!match)return'';
  if(clean(match[1]))return clean(match[1]);
  const rest=block.slice(match.index+match[0].length),next=rest.search(/\n- [A-Z][^\n:]*:/);
  return clean(rest.slice(0,next<0?undefined:next));
};

const SCHEMA_VERSION=2;
const aliases={
  observed:['OBSERVED','Verified observations','Observed base/head','Required evidence'],
  outcome:['Single outcome','Objective'],why:['Why now'],base:['Base branch','Base/branch'],
  allowed:['Allowed scope','Allowed files'],forbidden:['Forbidden scope','Forbidden files / conflicts'],
  budget:['Change budget','Allowed scope'],acceptance:['Acceptance criteria'],
  validation:['Validation','Required validation'],reviewer:['Independent reviewer'],
  artifact:['Expected artifact'],stop:['Stop conditions']
};
const semantic=(block,key)=>aliases[key]?.map(name=>field(block,name)).find(Boolean)||'';
const normalizeType=value=>({
  IMPLEMENT_PROCESS_GUARD:'IMPLEMENT',IMPLEMENT_CORRECTION:'IMPLEMENT',ARCHITECTURE_STEWARD:'REVIEW'
}[value]||value);
const profiles={
  implementation:['observed','outcome','why','base','allowed','forbidden','budget','acceptance','validation','reviewer','artifact','stop'],
  independent:['observed','outcome','forbidden','acceptance','artifact','stop']
};
const missing=(block,implementation)=>profiles[implementation?'implementation':'independent'].filter(key=>!semantic(block,key));
const reviewerIdentity=value=>clean(value.split(/[,(]/)[0]).replace(/[.:;!?]+$/,'').trim();
const acceptedStatuses=new Set(['READY','HOLD','NO_TASK','READY_AFTER_ARTIFACT','READY_AFTER_REPORTS']);

const fixturePath='scripts/verify-ai-team-os-fixtures.json';
if(!exists(fixturePath))errors.push(`missing required file ${fixturePath}`);
else{
  const fixture=JSON.parse(read(fixturePath));
  if(fixture.schemaVersion!==SCHEMA_VERSION)errors.push(`fixture schema must be ${SCHEMA_VERSION}`);
  const positive=missing(fixture.positive,true),negative=missing(fixture.negative,true);
  if(positive.length)errors.push(`positive semantic fixture missing ${positive.join(', ')}`);
  if(!negative.includes(fixture.negativeMissing))errors.push(`negative fixture must fail for ${fixture.negativeMissing}`);
}

const configPath='ops/ai-team/team.config.json';
if(!exists(configPath))throw new Error(`Missing ${configPath}`);
const config=JSON.parse(read(configPath)),workers=config.workers||[],workerSet=new Set(workers);
if(workerSet.size!==workers.length)errors.push('team.config.json has duplicate workers');
if(!workerSet.has(config.auditor))errors.push('auditor is not listed as a worker');
if(config.manager===config.auditor)errors.push('manager and auditor must be different');
const podWorkers=(config.pods||[]).flatMap(pod=>pod.workers||[]),podSet=new Set(podWorkers);
if(podSet.size!==podWorkers.length)errors.push('a worker appears in more than one pod');
if([...workerSet].some(worker=>!podSet.has(worker))||[...podSet].some(worker=>!workerSet.has(worker)))errors.push('pod membership must cover every worker exactly once');
if((config.pods||[]).length+1!==config.limits.activeAutomations)errors.push('manager + pod count must equal active automation limit');
const minutes=[config.managerMinute,...(config.pods||[]).map(pod=>pod.minute)];
if(new Set(minutes).size!==minutes.length||minutes.some(value=>!Number.isInteger(value)||value<0||value>59))errors.push('schedule minutes must be unique integers from 0 to 59');

const required=[
  'AGENTS.md','.github/copilot-instructions.md','.github/workflows/architecture-guardrails.yml',
  'docs/architecture/GAME_ARCHITECTURE.md','docs/architecture/MIGRATION_ROADMAP.md','docs/architecture/DEBT_REGISTER.md',
  'ops/ai-team/PROMPT_STANDARD.md','ops/ai-team/TEAM_OS.md','ops/ai-team/EVALUATION.md','ops/ai-team/PODS.md',
  'ops/ai-team/BOARD.md','ops/ai-team/HISTORY.md','ops/ai-team/manager.md','scripts/verify-architecture-guardrails.mjs',fixturePath
];
for(const file of required)if(!exists(file))errors.push(`missing required file ${file}`);
const board=read('ops/ai-team/BOARD.md'),boardCycle=clean(board.match(/^- Cycle:\s*(.+)$/m)?.[1]),boardStatus=clean(board.match(/^- Status:\s*(.+)$/m)?.[1]);
const freeze=/^PROCESS_FREEZE/.test(boardStatus),proven=/^- Capacity tier:\s*PROVEN\b/im.test(board);
if(!boardCycle)errors.push('BOARD.md has no active cycle');

let codeWriters=0,codePoints=0,nonCodeTasks=0;
const reviewers=[];
for(const worker of workers){
  const file=`ops/ai-team/workers/${worker.toLowerCase()}.md`;
  if(!exists(file)){errors.push(`missing worker file ${file}`);continue}
  const text=read(file);
  if(count(text,'<!-- MANAGER TASK:START -->')!==1||count(text,'<!-- MANAGER TASK:END -->')!==1)errors.push(`${worker}: manager task markers must appear exactly once`);
  if(count(text,'<!-- WORKER REPORT:START -->')!==1||count(text,'<!-- WORKER REPORT:END -->')!==1)errors.push(`${worker}: worker report markers must appear exactly once`);
  if(freeze){
    const expected=worker===config.auditor?'NO_CHANGE':'NO_TASK';
    if(!new RegExp(`\\|\\s*${escape(worker)}\\s*\\|[^\n]*\\\`${expected}\\\``).test(board))errors.push(`${worker}: freeze board must declare ${expected}`);
    continue;
  }
  const task=text.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'';
  const cycle=field(task,'Cycle'),id=field(task,'Task ID'),status=field(task,'Status');
  if(!cycle)errors.push(`${worker}: missing Cycle`);else if(cycle!==boardCycle)errors.push(`${worker}: cycle ${cycle} does not match board ${boardCycle}`);
  if(!id)errors.push(`${worker}: missing Task ID`);else if(!/^YAK-\d{3}-\d{2}$/.test(id))errors.push(`${worker}: invalid task id ${id}`);
  if(!status)errors.push(`${worker}: missing Status`);else if(!acceptedStatuses.has(status))errors.push(`${worker}: invalid status ${status}`);
  if(!board.includes(`| ${worker} |`))errors.push(`${worker}: missing from BOARD assignments/status table`);
  if(status==='NO_TASK')continue;
  const rawType=field(task,'Task type'),type=normalizeType(rawType),effort=field(task,'Effort'),risk=field(task,'Risk');
  if(!rawType)errors.push(`${worker}: missing Task type`);
  if(!effort)errors.push(`${worker}: missing Effort`);
  if(!risk)errors.push(`${worker}: missing Risk`);
  const implementation=config.implementationTypes.includes(type);
  for(const key of missing(task,implementation))errors.push(`${worker}: missing semantic field ${key} (schema v${SCHEMA_VERSION})`);
  if(type&&!config.allowedTaskTypes.includes(type))errors.push(`${worker}: invalid task type ${rawType}`);
  const match=effort.match(/^(XS|S|M)\s*\((\d+) points?\)$/i);
  if(!match){errors.push(`${worker}: invalid effort format ${effort}`);continue}
  const level=match[1].toUpperCase(),points=Number(match[2]);
  if(config.effortPoints[level]!==points)errors.push(`${worker}: ${level} must equal ${config.effortPoints[level]} points`);
  if(status!=='READY')continue;
  if(implementation){
    codeWriters++;codePoints+=points;
    const reviewer=semantic(task,'reviewer');
    if(!reviewer||/^none\b/i.test(reviewer))errors.push(`${worker}: implementation requires an independent reviewer`);
    else reviewers.push({worker,reviewer});
  }else nonCodeTasks++;
}
for(const {worker,reviewer} of reviewers){
  const name=reviewerIdentity(reviewer);
  if(name===worker)errors.push(`${worker}: self-review is forbidden`);
  if(!workerSet.has(name))errors.push(`${worker}: unknown reviewer ${name}`);
  if(name===config.auditor)errors.push(`${worker}: auditor cannot replace the implementation reviewer`);
}
if(!freeze){
  const maxWriters=proven?config.limits.provenMaxCodeWritersPerCycle:config.limits.defaultMaxCodeWritersPerCycle;
  const maxPoints=proven?config.limits.provenMaxCodeEffortPointsPerCycle:config.limits.defaultMaxCodeEffortPointsPerCycle;
  if(codeWriters>maxWriters)errors.push(`code writers ${codeWriters} exceed limit ${maxWriters}`);
  if(codePoints>maxPoints)errors.push(`code effort ${codePoints} exceeds limit ${maxPoints}`);
  if(nonCodeTasks<config.limits.minimumIndependentNonCodeTasks)errors.push(`non-code tasks ${nonCodeTasks} below minimum ${config.limits.minimumIndependentNonCodeTasks}`);
}
const manager=read('ops/ai-team/manager.md');
if(!/sole manager/i.test(manager))errors.push('manager.md must declare one sole manager');
for(const key of ['NO_TASK','Architecture Steward','legacy-debt delta','migration-gate delta'])if(!manager.includes(key))errors.push(`manager.md missing ${key}`);
const auditor=read(`ops/ai-team/workers/${config.auditor.toLowerCase()}.md`);
if(!/independent cycle auditor/i.test(auditor)||!/permanently read-only/i.test(auditor))errors.push('auditor file must enforce independent read-only operation');
if(!freeze&&normalizeType(field(auditor.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'','Task type'))!=='AUDIT')errors.push('auditor task type must be AUDIT');
for(const [file,keys] of [
  ['ops/ai-team/PODS.md',[...workers,'NO_TASK','NO_CHANGE','scheduling']],
  ['ops/ai-team/TEAM_OS.md',['NO_TASK','Architecture Steward','legacy-debt delta','migration-gate delta','PROMPT_STANDARD.md']],
  ['ops/ai-team/EVALUATION.md',['tripwires','MERGE_OK','Manager score','Capability ledger','ARCH_REJECT']],
  ['ops/ai-team/PROMPT_STANDARD.md',['OBSERVED','INFERRED','NO_TASK','Stop conditions']]
]){const text=read(file).toLowerCase();for(const key of keys)if(!text.includes(key.toLowerCase()))errors.push(`${file} missing ${key}`)}

if(errors.length){console.error(`AI Team OS verification failed with ${errors.length} error(s):`);for(const error of errors)console.error(`- ${error}`);process.exit(1)}
const mode=freeze?`freeze ${boardStatus}`:`${codeWriters} code writers, ${codePoints} code points, ${nonCodeTasks} independent READY tasks`;
console.log(`AI Team OS verified: schema v${SCHEMA_VERSION}, ${workers.length} workers, ${config.pods.length} pods, ${mode}, cycle ${boardCycle}.`);
