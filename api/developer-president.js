import {randomUUID,timingSafeEqual} from 'node:crypto';

const SPREADSHEET_ID='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c';
const SHEET_URL=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const TABS=Object.freeze({
  tasks:{name:'المهام',range:'A:L'},
  content:{name:'المحتوى',range:'A:M'},
  variants:{name:'المعاينات',range:'A:I'},
  comments:{name:'المحادثات',range:'A:I'},
  work:{name:'سجل العمل',range:'A:J'},
  settings:{name:'الإعدادات',range:'A:D'}
});
const STATUS_FROM_AR={جديدة:'planned','قيد التنفيذ':'in_progress','للمراجعة':'review',مكتملة:'done'};
const STATUS_TO_AR={planned:'جديدة',in_progress:'قيد التنفيذ',review:'للمراجعة',done:'مكتملة'};
const PARENT_FROM_AR={عام:'none',رحلة:'journey',مشهد:'scene',عنصر:'element'};
const PARENT_TO_AR={none:'عام',journey:'رحلة',scene:'مشهد',element:'عنصر'};
const KIND_FROM_AR={رحلة:'journey',مشهد:'scene',عنصر:'element'};
const ROLE_FROM_AR={الرئيس:'president',راشد:'manager',موظف:'worker',مراجع:'reviewer'};
const MAX_BODY_BYTES=250_000;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.end(JSON.stringify(payload));
}
function clean(value,max=20_000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function safeId(value,fallback=''){const id=clean(value,160).replace(/[^\p{L}\p{N}:_-]+/gu,'-');return id||fallback}
function yes(value){return ['نعم','yes','true','1'].includes(clean(value,20).toLocaleLowerCase('ar'))}
function parseJson(value,fallback={}){try{return JSON.parse(clean(value,10_000)||'{}')}catch{return fallback}}
function attachmentFromUrl(url){const value=clean(url,1200);if(!value)return[];return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(value)?[{name:'صورة',type:'image',data:value}]:[]}
function parseCsv(source){
  const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<source.length;index+=1){
    const character=source[index];
    if(quoted){
      if(character==='"'&&source[index+1]==='"'){cell+='"';index+=1}
      else if(character==='"')quoted=false;
      else cell+=character;
      continue;
    }
    if(character==='"'){quoted=true;continue}
    if(character===','){row.push(cell);cell='';continue}
    if(character==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';continue}
    cell+=character;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
  return rows;
}
function rowsToObjects(rows){
  const headers=(rows[0]||[]).map(header=>clean(header,120));
  return rows.slice(1).filter(row=>row.some(value=>clean(value))).map((row,index)=>{
    const object={_rowNumber:index+2};headers.forEach((header,column)=>{if(header)object[header]=clean(row[column])});return object;
  });
}
function csvUrl(name,range){return`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}&range=${encodeURIComponent(range)}&_=${Date.now()}`}
async function readTab(tab){
  const response=await fetch(csvUrl(tab.name,tab.range),{headers:{accept:'text/csv'},cache:'no-store'});
  if(!response.ok)throw new Error(`google_sheet_${tab.name}_${response.status}`);
  return rowsToObjects(parseCsv(await response.text()));
}
function buildTasks(rows){
  const tasks=[],taskStates=[];
  rows.forEach((row,index)=>{
    const id=safeId(row['المعرف'],`sheet-task-${index+2}`),deleted=yes(row['محذوف']),status=STATUS_FROM_AR[row['الحالة']]||'planned';
    const position=Number(row['الترتيب']);const updatedAt=clean(row['آخر تحديث'],80)||new Date(0).toISOString();
    taskStates.push({taskId:id,status,position:Number.isFinite(position)?position:index,deleted,updatedAt});
    if(deleted)return;
    const parentType=PARENT_FROM_AR[row['نوع الارتباط']]||'none',parentId=clean(row['مرتبط بـ'],160)||(parentType==='none'?'root-task-list':'');
    const link=clean(row['الرابط'],1200);
    tasks.push({id,kind:'task',title:clean(row['العنوان'],240)||'مهمة بلا عنوان',description:clean(row['التفاصيل']),status,owner:clean(row['المسؤول'],80),parentType,parentId,link,attachments:attachmentFromUrl(link),position:Number.isFinite(position)?position:index,createdAt:clean(row['أنشئ في'],80),updatedAt});
  });
  tasks.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id,'ar'));
  return{tasks,taskStates};
}
function buildContent(rows,variantRows){
  const variantsByContent=new Map();
  variantRows.filter(row=>yes(row['نشط'])).forEach((row,index)=>{
    const contentId=safeId(row['معرف المحتوى']),id=safeId(row['معرف النسخة'],'current');if(!contentId)return;
    const order=Number(row['الترتيب']);const variant={id,name:clean(row['اسم النسخة'],160)||id,description:clean(row['الوصف']),query:parseJson(row['بيانات الرابط'],{}),order:Number.isFinite(order)?order:index};
    const list=variantsByContent.get(contentId)||[];list.push(variant);variantsByContent.set(contentId,list);
  });
  for(const list of variantsByContent.values())list.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const content=rows.filter(row=>yes(row['نشط'])).map((row,index)=>{
    const id=safeId(row['المعرف'],`sheet-content-${index+2}`),kind=KIND_FROM_AR[row['النوع']]||clean(row['المفتاح البرمجي'],20);
    const order=Number(row['الترتيب']);return{id,kind,category:clean(row['الفئة'],60),title:clean(row['العنوان'],240)||id,description:clean(row['الوصف']),mark:clean(row['الرمز'],20),parentId:safeId(row['يتبع']),sourceKey:clean(row['مصدر المعاينة'],500),previewMode:clean(row['نمط المعاينة'],30)||'base',order:Number.isFinite(order)?order:index,updatedAt:clean(row['آخر تحديث'],80),variants:variantsByContent.get(id)||[{id:'current',name:'النسخة الحالية',description:'الحالة المعتمدة حاليًا',query:{},order:0}]};
  }).filter(item=>['journey','scene','element'].includes(item.kind));
  content.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id,'ar'));
  const byId=new Map(content.map(item=>[item.id,item]));
  for(const item of content)if(item.kind==='journey')item.scenes=content.filter(candidate=>candidate.kind==='scene'&&candidate.parentId===item.id&&candidate.category!=='sequence');
  for(const item of content)item.parent=byId.get(item.parentId)?.title||'';
  return content;
}
function buildComments(rows){return rows.filter(row=>!yes(row['محذوف'])).map((row,index)=>({id:safeId(row['المعرف'],`comment-${index+2}`),taskId:safeId(row['معرف المهمة']),authorName:clean(row['الكاتب'],80)||'أحمد',authorRole:ROLE_FROM_AR[row['الدور']]||'president',body:clean(row['النص']),link:clean(row['الرابط'],1200),attachments:attachmentFromUrl(row['الرابط']),createdAt:clean(row['أنشئ في'],80),updatedAt:clean(row['آخر تحديث'],80)})).filter(item=>item.taskId&&item.body)}
function buildWork(rows){return rows.filter(row=>!yes(row['محذوف'])).map((row,index)=>({id:safeId(row['المعرف'],`work-${index+2}`),taskId:safeId(row['معرف المهمة']),authorName:clean(row['الكاتب'],80)||'الفريق',authorRole:ROLE_FROM_AR[row['الدور']]||'worker',entryType:clean(row['نوع التحديث'],40)||'تحديث',body:clean(row['النص']),link:clean(row['الرابط'],1200),attachments:attachmentFromUrl(row['الرابط']),createdAt:clean(row['أنشئ في'],80),updatedAt:clean(row['آخر تحديث'],80)})).filter(item=>item.taskId&&item.body)}
function buildSettings(rows){return Object.fromEntries(rows.map(row=>[clean(row['المفتاح'],120),clean(row['القيمة'],2000)]).filter(([key])=>key))}
function writable(){return Boolean(process.env.YAKOLAK_SHEETS_SCRIPT_URL&&process.env.YAKOLAK_SHEETS_API_TOKEN)}
async function readAll(){
  const [taskRows,contentRows,variantRows,commentRows,workRows,settingRows]=await Promise.all([readTab(TABS.tasks),readTab(TABS.content),readTab(TABS.variants),readTab(TABS.comments),readTab(TABS.work),readTab(TABS.settings)]);
  const {tasks,taskStates}=buildTasks(taskRows),content=buildContent(contentRows,variantRows);
  return{ok:true,database:'google-sheets',databaseVersion:2,sourceOfTruth:'google-sheets',sheetUrl:SHEET_URL,tabs:Object.values(TABS).map(tab=>tab.name),writableInInterface:writable(),tasks,taskStates,content,taskComments:buildComments(commentRows),taskWork:buildWork(workRows),settings:buildSettings(settingRows),contentStates:[],messages:[]};
}
function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');return raw?JSON.parse(raw):{};
}
function sameSecret(left,right){const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
function authorize(req,body){
  if(body.actorRole==='manager'){const configured=process.env.RASHED_PORTAL_KEY,supplied=clean(req.headers['x-yakolak-manager-key'],500);if(configured&&!sameSecret(configured,supplied))throw new Error('manager_auth_required');return{role:'راشد',name:'راشد'}}
  if(body.actorRole==='worker'){const configured=process.env.YAKOLAK_WORKER_KEY,supplied=clean(req.headers['x-yakolak-worker-key'],500);if(configured&&!sameSecret(configured,supplied))throw new Error('worker_auth_required');return{role:'موظف',name:clean(body.actorName,80)||'الفريق'}}
  return{role:'الرئيس',name:'أحمد'};
}
async function scriptWrite(payload){
  if(!writable())throw new Error('sheet_write_bridge_not_configured');
  const response=await fetch(process.env.YAKOLAK_SHEETS_SCRIPT_URL,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({token:process.env.YAKOLAK_SHEETS_API_TOKEN,...payload})});
  if(!response.ok)throw new Error(`sheet_write_${response.status}`);const result=await response.json().catch(()=>({status:'success'}));if(result.status&&result.status!=='success')throw new Error(result.message||'sheet_write_failed');return result;
}
function now(){return new Date().toISOString()}
function rowWrite(gid,action,values,keyValue=''){return scriptWrite({action,gid,dataStartRow:2,keyColumn:'المعرف',keyValue,values})}
async function handleWrite(req,body){
  const actor=authorize(req,body),action=clean(body.action,80),updatedAt=now();
  if(action==='task_create'){
    const id=safeId(body.id,`task-${randomUUID()}`);await rowWrite(TABS.tasks.name,'append_row',{'المعرف':id,'العنوان':clean(body.title,240),'التفاصيل':clean(body.description),'الحالة':'جديدة','المسؤول':clean(body.owner,80)||actor.name,'نوع الارتباط':PARENT_TO_AR[body.parentType]||'عام','مرتبط بـ':clean(body.parentId,160)||'عام','الرابط':clean(body.link,1200),'الترتيب':Number(body.position)||999,'محذوف':'لا','أنشئ في':updatedAt,'آخر تحديث':updatedAt});return{ok:true,id};
  }
  if(['task_update','task_status','task_delete'].includes(action)){
    const id=safeId(body.taskId);if(!id)throw new Error('invalid_task_id');const values={'آخر تحديث':updatedAt};
    if(action==='task_update')Object.assign(values,{'العنوان':clean(body.title,240),'التفاصيل':clean(body.description),'المسؤول':clean(body.owner,80),'نوع الارتباط':PARENT_TO_AR[body.parentType]||'عام','مرتبط بـ':clean(body.parentId,160)||'عام','الرابط':clean(body.link,1200)});
    if(action==='task_status')values['الحالة']=STATUS_TO_AR[body.status]||'جديدة';
    if(action==='task_delete')values['محذوف']='نعم';
    await rowWrite(TABS.tasks.name,'update_row_by_key',values,id);return{ok:true,id};
  }
  if(action==='task_comment'){
    const id=safeId(body.id,`comment-${randomUUID()}`);await rowWrite(TABS.comments.name,'append_row',{'المعرف':id,'معرف المهمة':safeId(body.taskId),'الكاتب':actor.name,'الدور':actor.role,'النص':clean(body.body),'الرابط':clean(body.link,1200),'محذوف':'لا','أنشئ في':updatedAt,'آخر تحديث':updatedAt});return{ok:true,id};
  }
  if(action==='task_work_add'){
    const id=safeId(body.id,`work-${randomUUID()}`);await rowWrite(TABS.work.name,'append_row',{'المعرف':id,'معرف المهمة':safeId(body.taskId),'الكاتب':actor.name,'الدور':actor.role==='الرئيس'?'مراجع':actor.role,'نوع التحديث':clean(body.entryType,40)||'تحديث','النص':clean(body.body),'الرابط':clean(body.link,1200),'محذوف':'لا','أنشئ في':updatedAt,'آخر تحديث':updatedAt});return{ok:true,id};
  }
  if(action==='content_update'){
    const id=safeId(body.itemId);if(!id)throw new Error('invalid_content_id');await rowWrite(TABS.content.name,'update_row_by_key',{'العنوان':clean(body.title,240),'الوصف':clean(body.description),'نشط':body.active===false?'لا':'نعم','آخر تحديث':updatedAt},id);return{ok:true,id};
  }
  if(action==='content_delete'){
    const id=safeId(body.itemId);if(!id)throw new Error('invalid_content_id');await rowWrite(TABS.content.name,'update_row_by_key',{'نشط':'لا','آخر تحديث':updatedAt},id);return{ok:true,id};
  }
  throw new Error('unknown_action');
}
export default async function handler(req,res){
  if(req.method==='GET'){
    try{return json(res,200,await readAll())}catch(error){console.error('[Yakolak Google Sheets]',error);return json(res,502,{ok:false,error:'تعذر قراءة قاعدة بيانات Google Sheets',sheetUrl:SHEET_URL})}
  }
  if(req.method==='POST'){
    try{const result=await handleWrite(req,parseBody(req));return json(res,200,result)}catch(error){const code=String(error.message||error);const status=code.includes('auth_required')?401:code==='sheet_write_bridge_not_configured'?503:400;return json(res,status,{ok:false,error:code,sheetUrl:SHEET_URL})}
  }
  res.setHeader('allow','GET, POST');return json(res,405,{ok:false,error:'method_not_allowed',sheetUrl:SHEET_URL});
}
