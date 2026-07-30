import {createSign,timingSafeEqual} from 'node:crypto';

const SHEET_ID=process.env.YAKOLAK_GOOGLE_SHEET_ID||'1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c';
const SHEET_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const TAB='إدارة التطوير';
const TASK_STATUSES=new Set(['planned','in_progress','review','done']);
const PARENT_TYPES=new Set(['none','scene','journey','element']);
const WORK_ENTRY_TYPES=new Set(['delegation','update']);
const WORKER_NAMES=new Set(['Noor','Sami','Lina','Mazen','Nada','Omar','Sara','Hakam','Kamel','Kamila','Mokamel','Kamelia','Mokmel']);
const ID_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,159}$/;
const STATUS_TO_AR={planned:'جديدة',in_progress:'قيد التنفيذ',review:'للمراجعة',done:'مكتملة'};
const STATUS_FROM_AR=Object.fromEntries(Object.entries(STATUS_TO_AR).map(([key,value])=>[value,key]));
const PARENT_TO_AR={none:'عام',scene:'مشهد',journey:'رحلة',element:'عنصر'};
const PARENT_FROM_AR=Object.fromEntries(Object.entries(PARENT_TO_AR).map(([key,value])=>[value,key]));
let tokenCache=null;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.end(JSON.stringify(payload));
}
function portalEnabled(){return process.env.VERCEL_ENV!=='production'||process.env.PRESIDENT_PORTAL_PRODUCTION_ENABLED==='1'}
function sameOrigin(req){
  const origin=String(req.headers.origin||''),host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!origin||!host)return true;
  try{return new URL(origin).host===host}catch{return false}
}
function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  if(Buffer.byteLength(raw,'utf8')>220_000)throw new Error('payload_too_large');
  return raw?JSON.parse(raw):{};
}
const cleanText=(value,max)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
function cleanId(value){const id=cleanText(value,160);if(!ID_PATTERN.test(id))throw new Error('invalid_id');return id}
function safeEqual(left,right){
  const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
function actorFor(req,body){
  if(body.actorRole==='worker'){
    const name=cleanText(body.actorName,40);
    if(!WORKER_NAMES.has(name))throw new Error('worker_auth_required');
    const configured=process.env.YAKOLAK_WORKER_KEY;
    const supplied=String(req.headers['x-yakolak-worker-key']||'').trim();
    if(!configured&&process.env.VERCEL_ENV!=='production')return`worker:${name}`;
    if(!configured||!safeEqual(configured,supplied))throw new Error('worker_auth_required');
    return`worker:${name}`;
  }
  if(body.actorRole!=='manager')return'president';
  const configured=process.env.RASHED_PORTAL_KEY;
  const supplied=String(req.headers['x-yakolak-manager-key']||'').trim();
  if(!configured&&process.env.VERCEL_ENV!=='production')return'manager';
  if(!configured||!safeEqual(configured,supplied))throw new Error('manager_auth_required');
  return'manager';
}
function credentials(){
  const email=cleanText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,320);
  const privateKey=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n').trim();
  return email&&privateKey?{email,privateKey}:null;
}
function base64url(value){return Buffer.from(value).toString('base64url')}
async function getAccessToken(){
  if(tokenCache&&tokenCache.expiresAt>Date.now()+60_000)return tokenCache.value;
  const auth=credentials();if(!auth)throw new Error('sheets_write_not_configured');
  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=base64url(JSON.stringify({iss:auth.email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const unsigned=`${header}.${claim}`;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${signer.sign(auth.privateKey).toString('base64url')}`;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.access_token)throw new Error('sheets_auth_failed');
  tokenCache={value:payload.access_token,expiresAt:Date.now()+Number(payload.expires_in||3600)*1000};
  return tokenCache.value;
}
async function sheetsFetch(path,options={}){
  const token=await getAccessToken();
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){console.error('[Yakolak Sheets]',response.status,payload);throw new Error('sheets_request_failed')}
  return payload;
}
async function privateRows(){
  const range=encodeURIComponent(`'${TAB}'!A2:I1000`);
  const payload=await sheetsFetch(`/values/${range}?majorDimension=ROWS`);
  return Array.isArray(payload.values)?payload.values:[];
}
async function publicRows(){
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(TAB)}&tq=${encodeURIComponent('select *')}`;
  const response=await fetch(url,{headers:{accept:'text/plain'},cache:'no-store'});
  if(!response.ok)throw new Error('public_sheet_unavailable');
  const source=await response.text(),start=source.indexOf('{'),end=source.lastIndexOf('}');
  if(start<0||end<=start)throw new Error('public_sheet_invalid');
  const payload=JSON.parse(source.slice(start,end+1));
  return (payload.table?.rows||[]).map(row=>(row.c||[]).map(cell=>cell?.v??''));
}
async function rows(){return credentials()?privateRows():publicRows()}
function parseParent(value){
  const raw=cleanText(value,240);if(!raw||raw==='عام')return{parentType:'none',parentId:'root-task-list'};
  const [label,...idParts]=raw.split(':');const parentType=PARENT_FROM_AR[cleanText(label,40)]||'none';
  return{parentType,parentId:cleanText(idParts.join(':'),160)||'root-task-list'};
}
function parentCell(parentType,parentId){return parentType==='none'?'عام':`${PARENT_TO_AR[parentType]||'عام'}: ${parentId||'root-task-list'}`}
function taskFromRow(row,index){
  const id=cleanText(row[0],160);if(!id||cleanText(row[1],30)!=='مهمة')return null;
  const statusText=cleanText(row[4],40),status=STATUS_FROM_AR[statusText]||'planned',parent=parseParent(row[5]);
  return{id,title:cleanText(row[2],240)||'مهمة',description:cleanText(row[3],20_000),status,owner:cleanText(row[6],80),...parent,link:cleanText(row[7],1200),position:index,deleted:statusText==='محذوفة',createdBy:cleanText(row[6],80)||'أحمد',createdAt:cleanText(row[8],80),updatedAt:cleanText(row[8],80),attachments:[],rowNumber:index+2};
}
function commentFromRow(row,index){
  const id=cleanText(row[0],160);if(!id||cleanText(row[1],30)!=='رد')return null;
  const author=cleanText(row[6],60);
  return{id,taskId:cleanText(row[5],160),authorRole:author==='راشد'?'manager':'president',body:cleanText(row[3],12_000),attachments:[],createdAt:cleanText(row[8],80),rowNumber:index+2};
}
function workFromRow(row,index){
  const id=cleanText(row[0],160);if(!id||cleanText(row[1],30)!=='تحديث')return null;
  const author=cleanText(row[6],80),entryType=cleanText(row[2],40)==='تكليف'?'delegation':'update';
  return{id,taskId:cleanText(row[5],160),authorName:author,authorRole:author==='راشد'?'manager':'worker',entryType,body:cleanText(row[3],12_000),attachments:row[7]?[{name:'الدليل',type:'link',data:cleanText(row[7],1200)}]:[],createdAt:cleanText(row[8],80),rowNumber:index+2};
}
function contentFromRow(row,index){
  const id=cleanText(row[0],160);if(!id||cleanText(row[1],30)!=='محتوى')return null;
  return{itemId:id,deleted:cleanText(row[4],40)==='محذوفة',updatedAt:cleanText(row[8],80),rowNumber:index+2};
}
async function readAll(){
  const source=await rows();
  const tasks=source.map(taskFromRow).filter(Boolean),comments=source.map(commentFromRow).filter(Boolean),work=source.map(workFromRow).filter(Boolean),content=source.map(contentFromRow).filter(Boolean);
  return{writable:Boolean(credentials()),tasks:tasks.map(({status,position,deleted,rowNumber,...task})=>task),taskStates:tasks.map(task=>({taskId:task.id,status:task.status,position:task.position,deleted:task.deleted,updatedAt:task.updatedAt})),contentStates:content.map(({rowNumber,...entry})=>entry),taskComments:comments.map(({rowNumber,...entry})=>entry),taskWork:work.map(({rowNumber,...entry})=>entry)};
}
function taskRow(task){return[task.id,'مهمة',task.title,task.description,task.deleted?'محذوفة':STATUS_TO_AR[task.status]||STATUS_TO_AR.planned,parentCell(task.parentType,task.parentId),task.owner||task.createdBy||'أحمد',task.link||'',task.updatedAt]}
async function appendRow(row){
  const range=encodeURIComponent(`'${TAB}'!A:I`);
  return sheetsFetch(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
}
async function updateRow(rowNumber,row){
  const range=encodeURIComponent(`'${TAB}'!A${rowNumber}:I${rowNumber}`);
  return sheetsFetch(`/values/${range}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
}
async function findTask(taskId){
  const source=await privateRows(),task=source.map(taskFromRow).filter(Boolean).find(entry=>entry.id===taskId);
  if(!task)throw new Error('task_not_found');return task;
}
async function createTask(body,actor){
  const id=cleanId(body.id),title=cleanText(body.title,240),description=cleanText(body.description,20_000),owner=cleanText(body.owner,80);
  const parentType=cleanText(body.parentType||'none',24),parentId=cleanText(body.parentId||'root-task-list',160)||'root-task-list';
  if(!title||!PARENT_TYPES.has(parentType))throw new Error('invalid_task');
  const source=await privateRows();if(source.some(row=>cleanText(row[0],160)===id))throw new Error('duplicate_task');
  const now=new Date().toISOString(),task={id,title,description,status:'planned',owner:owner||(actor==='manager'?'راشد':''),parentType,parentId,link:'',position:source.length,deleted:false,createdBy:actor==='president'?'أحمد':actor==='manager'?'راشد':actor,createdAt:now,updatedAt:now,attachments:[]};
  if(!task.owner)task.owner=task.createdBy;
  await appendRow(taskRow(task));return task;
}
async function updateTask(body,actor){
  if(actor!=='president')throw new Error('protected_author_content');
  const task=await findTask(cleanId(body.taskId)),parentType=cleanText(body.parentType||task.parentType,24),parentId=cleanText(body.parentId||task.parentId,160)||'root-task-list';
  task.title=cleanText(body.title,240);task.description=cleanText(body.description,20_000);task.owner=cleanText(body.owner,80);task.parentType=PARENT_TYPES.has(parentType)?parentType:task.parentType;task.parentId=parentId;task.updatedAt=new Date().toISOString();
  if(!task.title)throw new Error('invalid_task');await updateRow(task.rowNumber,taskRow(task));return task;
}
async function setTaskStatus(body,actor){
  const task=await findTask(cleanId(body.taskId)),status=cleanText(body.status,24);
  if(!TASK_STATUSES.has(status))throw new Error('invalid_task_status');
  if(actor==='manager'&&status==='done')throw new Error('president_approval_required');
  if(status==='in_progress'){
    const source=await privateRows();
    for(const [index,row] of source.entries()){
      const other=taskFromRow(row,index);if(other&&other.id!==task.id&&!other.deleted&&other.status==='in_progress'){other.status='planned';other.updatedAt=new Date().toISOString();await updateRow(other.rowNumber,taskRow(other))}
    }
  }
  task.status=status;task.updatedAt=new Date().toISOString();await updateRow(task.rowNumber,taskRow(task));
  return{taskId:task.id,status:task.status,position:task.position,deleted:false,updatedAt:task.updatedAt};
}
async function deleteTask(body){const task=await findTask(cleanId(body.taskId));task.deleted=true;task.updatedAt=new Date().toISOString();await updateRow(task.rowNumber,taskRow(task));return{taskId:task.id,status:task.status,position:task.position,deleted:true,updatedAt:task.updatedAt}}
async function deleteContent(body){
  const itemId=cleanId(body.itemId),now=new Date().toISOString(),source=await privateRows(),index=source.findIndex(row=>cleanText(row[0],160)===itemId&&cleanText(row[1],30)==='محتوى');
  const row=[itemId,'محتوى','محتوى محذوف','', 'محذوفة','عام','أحمد','',now];
  if(index>=0)await updateRow(index+2,row);else await appendRow(row);return{itemId,deleted:true,updatedAt:now};
}
async function addTaskComment(body,actor){
  if(actor.startsWith('worker:'))throw new Error('worker_channel_forbidden');
  const id=cleanId(body.id),taskId=cleanId(body.taskId),comment=cleanText(body.body,12_000);if(!comment)throw new Error('invalid_comment');
  const createdAt=new Date().toISOString(),authorRole=actor==='manager'?'manager':'president',author=authorRole==='manager'?'راشد':'أحمد';
  await appendRow([id,'رد','رد',comment,'',taskId,author,'',createdAt]);return{id,taskId,authorRole,body:comment,attachments:[],createdAt};
}
async function updateTaskComment(body,actor){
  if(actor!=='president')throw new Error('protected_author_content');
  const commentId=cleanId(body.commentId),comment=cleanText(body.body,12_000);if(!comment)throw new Error('invalid_comment');
  const source=await privateRows(),index=source.findIndex(row=>cleanText(row[0],160)===commentId&&cleanText(row[1],30)==='رد'&&cleanText(row[6],60)==='أحمد');if(index<0)throw new Error('protected_author_content');
  const current=commentFromRow(source[index],index),updated=[current.id,'رد','رد',comment,'',current.taskId,'أحمد','',current.createdAt];await updateRow(index+2,updated);return{...current,body:comment,attachments:[]};
}
async function addTaskWork(body,actor){
  const id=cleanId(body.id),taskId=cleanId(body.taskId),entryType=cleanText(body.entryType,24),work=cleanText(body.body,12_000),link=cleanText(body.link,1200);if(!WORK_ENTRY_TYPES.has(entryType)||!work)throw new Error('invalid_work_entry');
  const worker=actor.startsWith('worker:'),authorName=worker?actor.slice(7):'راشد';if(actor!=='manager'&&!worker)throw new Error('work_channel_forbidden');if(entryType==='delegation'&&actor!=='manager')throw new Error('manager_auth_required');
  const createdAt=new Date().toISOString(),authorRole=worker?'worker':'manager';await appendRow([id,'تحديث',entryType==='delegation'?'تكليف':'تحديث',work,'',taskId,authorName,link,createdAt]);return{id,taskId,authorName,authorRole,entryType,body:work,attachments:link?[{name:'الدليل',type:'link',data:link}]:[],createdAt};
}
function statusFor(error){
  if(error?.message==='payload_too_large')return 413;
  if(['invalid_id','invalid_payload','invalid_task','invalid_task_status','invalid_comment','invalid_work_entry'].includes(error?.message))return 400;
  if(['manager_auth_required','worker_auth_required','worker_channel_forbidden','work_channel_forbidden','protected_author_content','president_approval_required'].includes(error?.message))return 403;
  if(error?.message==='task_not_found')return 404;if(error?.message==='duplicate_task')return 409;
  if(['sheets_write_not_configured','sheets_auth_failed','sheets_request_failed'].includes(error?.message))return 503;
  if(error?.message==='forbidden_origin')return 403;return 500;
}
export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  if(!portalEnabled()){json(res,403,{ok:false,error:'president_portal_disabled_in_production'});return}
  try{
    if(req.method==='GET'){const payload=await readAll();json(res,200,{ok:true,channelVersion:3,storage:'google-sheets',sheetId:SHEET_ID,sheetUrl:SHEET_URL,...payload});return}
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}
    if(!sameOrigin(req))throw new Error('forbidden_origin');
    let body;try{body=parseBody(req)}catch{throw new Error('invalid_payload')}
    const action=cleanText(body.action,40),actor=actorFor(req,body);if(actor.startsWith('worker:')&&action!=='task_work_add')throw new Error('work_channel_forbidden');
    if(!credentials())throw new Error('sheets_write_not_configured');
    if(action==='task_create')json(res,200,{ok:true,task:await createTask(body,actor)});
    else if(action==='task_update')json(res,200,{ok:true,task:await updateTask(body,actor)});
    else if(action==='task_status')json(res,200,{ok:true,taskState:await setTaskStatus(body,actor)});
    else if(action==='task_delete')json(res,200,{ok:true,taskState:await deleteTask(body)});
    else if(action==='content_delete')json(res,200,{ok:true,contentState:await deleteContent(body)});
    else if(action==='task_comment')json(res,200,{ok:true,comment:await addTaskComment(body,actor)});
    else if(action==='task_comment_update')json(res,200,{ok:true,comment:await updateTaskComment(body,actor)});
    else if(action==='task_work_add')json(res,200,{ok:true,work:await addTaskWork(body,actor)});
    else throw new Error('invalid_payload');
  }catch(error){const status=statusFor(error);if(status>=500)console.error('[Yakolak] Google Sheets portal failed',error);json(res,status,{ok:false,error:status>=500?'google_sheets_store_error':error.message,sheetUrl:SHEET_URL})}
}
