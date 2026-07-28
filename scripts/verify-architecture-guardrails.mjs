import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const failures=[];
const requiredDocs=[
  'docs/architecture/GAME_ARCHITECTURE.md',
  'docs/architecture/MIGRATION_ROADMAP.md',
  'docs/architecture/DEBT_REGISTER.md'
];

for(const file of requiredDocs){
  if(!fs.existsSync(path.join(root,file)))fail(`${file}: required architecture document is missing`);
}

const srcDir=path.join(root,'src');
if(fs.existsSync(srcDir)){
  for(const entry of fs.readdirSync(srcDir,{withFileTypes:true})){
    if(!entry.isFile())continue;
    const match=/^app-game-v(\d+)(.*?)\.js$/.exec(entry.name);
    if(!match)continue;
    const build=Number(match[1]);
    if(build>126)fail(`${entry.name}: new version-layer runtime files after Build 126 are forbidden`);
    if(match[2])fail(`${entry.name}: suffixed version-layer runtime files are forbidden`);
  }
}

const canonicalRoots=['src/core','src/game','src/experience','src/network','src/render'];
for(const dir of canonicalRoots){
  for(const file of walk(path.join(root,dir))){
    if(!/\.[cm]?[jt]sx?$/.test(file))continue;
    const rel=relative(file);
    const text=fs.readFileSync(file,'utf8');
    forbid(text,rel,/\bnew\s+Blob\s*\(/,'Blob modules');
    forbid(text,rel,/URL\.createObjectURL\s*\(/,'object-URL bootstrapping');
    forbid(text,rel,/globalThis\.__yakolak[A-Za-z0-9_]*/,'hidden global contracts');
    forbid(text,rel,/\breplace(?:Exact|Regex)\s*\(/,'runtime source patching');
    if(rel.startsWith('src/game/')){
      forbid(text,rel,/\b(?:document|window|HTMLElement)\b/,'DOM access in the pure game core');
      forbid(text,rel,/\bTHREE\b|from\s+['"]three(?:\/|['"])/,'Three.js access in the pure game core');
      forbid(text,rel,/\bfetch\s*\(/,'network access in the pure game core');
      forbid(text,rel,/\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/,'wall-clock scheduling in the pure game core');
      forbid(text,rel,/\b(?:localStorage|sessionStorage)\b/,'storage access in the pure game core');
    }
  }
}

const diffArgIndex=process.argv.indexOf('--diff');
if(diffArgIndex>=0){
  const base=process.argv[diffArgIndex+1];
  if(!base)fail('--diff requires a base ref');
  else inspectDiff(base);
}

if(failures.length){
  console.error('Architecture guardrails failed:');
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Architecture guardrails passed.');

function inspectDiff(base){
  let output='';
  try{
    output=execFileSync('git',['diff','--name-status',`${base}...HEAD`],{cwd:root,encoding:'utf8'});
  }catch(error){
    fail(`cannot inspect architecture diff against ${base}: ${error.message}`);
    return;
  }
  for(const line of output.split(/\r?\n/).filter(Boolean)){
    const [status,...parts]=line.split('\t');
    const rel=parts.at(-1);
    if(!rel||!fs.existsSync(path.join(root,rel))||!rel.match(/\.[cm]?js$/))continue;
    if(status.startsWith('A')&&/^src\/app-game-v\d+.*\.js$/.test(rel)){
      fail(`${rel}: adding another version-layer runtime is forbidden`);
    }
    const current=fs.readFileSync(path.join(root,rel),'utf8');
    const previous=status.startsWith('A')?'':readFromGit(base,rel);
    const patterns=[
      [/\bnew\s+Blob\s*\(/g,'Blob module'],
      [/URL\.createObjectURL\s*\(/g,'object-URL bootstrap'],
      [/\breplace(?:Exact|Regex)\s*\(/g,'runtime source patch'],
      [/globalThis\.__yakolak[A-Za-z0-9_]*/g,'hidden global contract']
    ];
    for(const [pattern,label] of patterns){
      const currentCount=count(current,pattern);
      const previousCount=count(previous,pattern);
      if(currentCount>previousCount)fail(`${rel}: introduces ${currentCount-previousCount} new ${label} occurrence(s)`);
    }
  }
}

function readFromGit(base,rel){
  try{return execFileSync('git',['show',`${base}:${rel}`],{cwd:root,encoding:'utf8'});}catch{return '';}
}

function count(text,pattern){return (text.match(pattern)||[]).length;}
function forbid(text,rel,pattern,label){if(pattern.test(text))fail(`${rel}: ${label} is forbidden`);}
function fail(message){failures.push(message);}
function relative(file){return path.relative(root,file).split(path.sep).join('/');}
function walk(dir){
  if(!fs.existsSync(dir))return[];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(file));
    else out.push(file);
  }
  return out;
}
