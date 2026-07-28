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
  const match=block.match(new RegExp(`^- ${escape(name)}:\\s*(.+)$`,'m'));
  return clean(match?.[1]);
};
const requireValue=(block,name,worker)=>{
  const value=field(block,name);
  if(!value)errors.push(`${worker}: missing ${name}`);
  return value;
};

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

const requiredStatic=['AGENTS.md','.github/copilot-instructions.md','ops/ai-team/TEAM_OS.md','ops/ai-team/EVALUATION.md','ops/ai-team/PODS.md','ops/ai-team/BOARD.md','ops/ai-team/HISTORY.md','ops/ai-team/manager.md'];
for(const file of requiredStatic)if(!exists(file))errors.push(`missing required file ${file}`);

const board=read('ops/ai-team/BOARD.md');
const boardCycle=clean(board.match(/^- Cycle:\s*(.+)$/m)?.[1]);
if(!boardCycle)errors.push('BOARD.md has no active cycle');

let codeWriters=0;
let codePoints=0;
let nonCodeTasks=0;
const taskReviewers=[];

for(const worker of workers){
  const relative=`ops/ai-team/workers/${worker.toLowerCase()}.md`;
  if(!exists(relative)){
    errors.push(`missing worker file ${relative}`);
    continue;
  }
  const text=read(relative);
  if(count(text,'<!-- MANAGER TASK:START -->')!==1||count(text,'<!-- MANAGER TASK:END -->')!==1)errors.push(`${worker}: manager task markers must appear exactly once`);
  if(count(text,'<!-- WORKER REPORT:START -->')!==1||count(text,'<!-- WORKER REPORT:END -->')!==1)errors.push(`${worker}: worker report markers must appear exactly once`);
  const task=text.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'';
  const cycle=requireValue(task,'Cycle',worker);
  const id=requireValue(task,'Task ID',worker);
  const status=requireValue(task,'Status',worker);
  const type=requireValue(task,'Task type',worker);
  const effort=requireValue(task,'Effort',worker);
  requireValue(task,'Risk',worker);
  requireValue(task,'Objective',worker);
  requireValue(task,'Why now',worker);
  requireValue(task,'Observed base/head',worker);
  requireValue(task,'Base branch',worker);
  requireValue(task,'Allowed files',worker);
  requireValue(task,'Forbidden files / conflicts',worker);
  requireValue(task,'Change budget',worker);
  requireValue(task,'Acceptance criteria',worker);
  requireValue(task,'Required validation',worker);
  const reviewer=requireValue(task,'Independent reviewer',worker);
  requireValue(task,'Expected artifact',worker);
  requireValue(task,'Context links',worker);

  if(cycle&&boardCycle&&cycle!==boardCycle)errors.push(`${worker}: cycle ${cycle} does not match board ${boardCycle}`);
  if(id&&!/^YAK-\d{3}-\d{2}$/.test(id))errors.push(`${worker}: invalid task id ${id}`);
  if(status&&!['READY','HOLD','NO_TASK'].includes(status))errors.push(`${worker}: invalid status ${status}`);
  if(type&&!config.allowedTaskTypes.includes(type))errors.push(`${worker}: invalid task type ${type}`);
  const effortMatch=effort.match(/^(XS|S|M)\s*\((\d+) points?\)$/i);
  if(!effortMatch){
    errors.push(`${worker}: invalid effort format ${effort}`);
  }else{
    const level=effortMatch[1].toUpperCase();
    const points=Number(effortMatch[2]);
    if(config.effortPoints[level]!==points)errors.push(`${worker}: ${level} must equal ${config.effortPoints[level]} points`);
    if(config.implementationTypes.includes(type)){
      codeWriters+=1;
      codePoints+=points;
      if(!reviewer||/^none\b/i.test(reviewer))errors.push(`${worker}: implementation requires an independent reviewer`);
      else taskReviewers.push({worker,reviewer});
    }else nonCodeTasks+=1;
  }
  if(!board.includes(`| ${worker} |`))errors.push(`${worker}: missing from BOARD active assignments`);
}

for(const {worker,reviewer} of taskReviewers){
  const reviewerName=reviewer.split(/[,(]/)[0].trim();
  if(reviewerName===worker)errors.push(`${worker}: self-review is forbidden`);
  if(!workerSet.has(reviewerName))errors.push(`${worker}: unknown reviewer ${reviewerName}`);
  if(reviewerName===config.auditor)errors.push(`${worker}: auditor cannot replace the implementation reviewer`);
}

if(codeWriters>config.limits.maxCodeWritersPerCycle)errors.push(`code writers ${codeWriters} exceed limit ${config.limits.maxCodeWritersPerCycle}`);
if(codePoints>config.limits.maxCodeEffortPointsPerCycle)errors.push(`code effort ${codePoints} exceeds limit ${config.limits.maxCodeEffortPointsPerCycle}`);
if(nonCodeTasks<config.limits.minimumIndependentNonCodeTasks)errors.push(`non-code tasks ${nonCodeTasks} below minimum ${config.limits.minimumIndependentNonCodeTasks}`);

const manager=read('ops/ai-team/manager.md');
if(!/sole manager/i.test(manager))errors.push('manager.md must declare one sole manager');
const auditorFile=read(`ops/ai-team/workers/${config.auditor.toLowerCase()}.md`);
if(!/independent cycle auditor/i.test(auditorFile)||!/permanently read-only/i.test(auditorFile))errors.push('auditor file must enforce independent read-only operation');
const auditorTask=auditorFile.match(/<!-- MANAGER TASK:START -->([\s\S]*?)<!-- MANAGER TASK:END -->/)?.[1]||'';
if(field(auditorTask,'Task type')!=='AUDIT')errors.push('auditor task type must be AUDIT');

const pods=read('ops/ai-team/PODS.md');
for(const worker of workers)if(!pods.includes(worker))errors.push(`PODS.md does not mention ${worker}`);
const evaluation=read('ops/ai-team/EVALUATION.md');
for(const keyword of ['Tripwires','MERGE_OK','Manager score','Capability ledger'])if(!evaluation.includes(keyword))errors.push(`EVALUATION.md missing ${keyword}`);

if(errors.length){
  console.error(`AI Team OS verification failed with ${errors.length} error(s):`);
  for(const error of errors)console.error(`- ${error}`);
  process.exit(1);
}

console.log(`AI Team OS verified: ${workers.length} workers, ${config.pods.length} pods, ${codeWriters} code writers, ${codePoints} code points, ${nonCodeTasks} independent non-code tasks, cycle ${boardCycle}.`);
