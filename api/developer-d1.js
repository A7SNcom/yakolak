import {randomUUID} from 'node:crypto';
import {createClient} from '@tursodatabase/serverless/compat';

const ENTITY_TABLE='yakolak_developer_d1_entities';
const EVENT_TABLE='yakolak_developer_d1_events';
const THREAD_TABLE='yakolak_developer_d1_threads';
const COMMENT_TABLE='yakolak_developer_d1_comments';
const MAX_BODY_BYTES=48_000;
const ENTITY_TYPES=new Set(['scene','element']);
const THREAD_STATUSES=new Set(['open','in_progress','ready_for_review','needs_changes','approved','rejected']);
const AUTHOR_ROLES=new Set(['reviewer','developer','system']);
const COMMENT_KINDS=new Set(['comment','reply','implementation','decision','legacy']);
const ID_PATTERN=/^[a-z0-9][a-z0-9-]{1,79}$/;
const UUID_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{5,119}$/;
let client;
let tablesReady;

const LEGACY_RESOLUTIONS={
  'scene:empty-table':'تم تنفيذ الملاحظة: فُتح لون الطاولة إلى رمادي متوسط متوازن، وأُعيد إظهار حدود الغرفة الاثني عشر بنفس الوزن واللون. التغيير جاهز لمراجعتك.',
  'scene:logo-wall':'تم إصلاح حركة كاميرا جدار الشعارات وربط هدف التحكم بالجدار نفسه، مع احترام عمق الغرفة حتى لا تظهر قفزة عند التقريب والإبعاد. التغيير جاهز لمراجعتك.',
  'scene:clean-entry':'أُعيد بناء رحلة الدخول كمسار كاميرا متصل دون قطع أو فلاشات. التغيير جاهز لمراجعتك.',
  'scene:unboxing-intro':'تم إظهار ميدان اللعب الكبير داخل إنترو فك العلبة مع الغطاء والقواعد الأربع، مع عزل الإنترو عن اختيار اللون وعدد اللاعبين. التغيير جاهز لمراجعتك.'
};

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.end(JSON.stringify(payload));
}
function getClient(){
  const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)return null;
  client||=createClient({url,authToken});
  return client;
}
async function ensureTables(db){
  tablesReady||=(async()=>{
    await Promise.all([
      db.execute(`CREATE TABLE IF NOT EXISTS ${ENTITY_TABLE} (entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,source_key TEXT NOT NULL DEFAULT '',display_name TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(entity_type,entity_id))`),
      db.execute(`CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)`),
      db.execute(`CREATE TABLE IF NOT EXISTS ${THREAD_TABLE} (id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',title TEXT NOT NULL DEFAULT '',legacy_source TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(entity_type,entity_id,legacy_source))`),
      db.execute(`CREATE TABLE IF NOT EXISTS ${COMMENT_TABLE} (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,author_role TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'comment',body TEXT NOT NULL,created_at TEXT NOT NULL)`)
    ]);
    await Promise.all([
      db.execute(`CREATE INDEX IF NOT EXISTS idx_d1_threads_entity ON ${THREAD_TABLE}(entity_type,entity_id,updated_at DESC)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_d1_comments_thread ON ${COMMENT_TABLE}(thread_id,created_at ASC)`)
    ]);
  })();
  await tablesReady;
}
function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');
  return raw?JSON.parse(raw):{};
}
const cleanText=(value,max)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
function cleanId(value){const id=cleanText(value,120);if(!UUID_PATTERN.test(id))throw new Error('invalid_id');return id}
function validateEntityIdentity(body){const entityType=cleanText(body.entityType,16),entityId=cleanText(body.entityId,80);if(!ENTITY_TYPES.has(entityType)||!ID_PATTERN.test(entityId))throw new Error('invalid_entity');return{entityType,entityId}}
function validateEntity(body){const identity=validateEntityIdentity(body);return{...identity,sourceKey:cleanText(body.sourceKey,180),displayName:cleanText(body.displayName,100),notes:cleanText(body.notes,16_000),notesProvided:Object.prototype.hasOwnProperty.call(body,'notes')}}
function validateStatus(value){const status=cleanText(value,32);if(!THREAD_STATUSES.has(status))throw new Error('invalid_status');return status}
function validateRole(value,fallback='reviewer'){const role=cleanText(value||fallback,24);if(!AUTHOR_ROLES.has(role))throw new Error('invalid_role');return role}
function validateKind(value,fallback='comment'){const kind=cleanText(value||fallback,24);if(!COMMENT_KINDS.has(kind))throw new Error('invalid_kind');return kind}
function sameOrigin(req){const origin=String(req.headers.origin||''),host=String(req.headers['x-forwarded-host']||req.headers.host||'');if(!origin||!host)return true;try{return new URL(origin).host===host}catch{return false}}
const entityFromRow=row=>({entityType:String(row.entity_type),entityId:String(row.entity_id),sourceKey:String(row.source_key||''),displayName:String(row.display_name||''),notes:String(row.notes||''),version:Number(row.version||1),createdAt:String(row.created_at||''),updatedAt:String(row.updated_at||'')});
const commentFromRow=row=>({id:String(row.id),threadId:String(row.thread_id),authorRole:String(row.author_role),kind:String(row.kind||'comment'),body:String(row.body||''),createdAt:String(row.created_at||'')});
const threadFromRow=(row,comments=[])=>({id:String(row.id),entityType:String(row.entity_type),entityId:String(row.entity_id),status:String(row.status||'open'),title:String(row.title||''),legacySource:String(row.legacy_source||''),createdAt:String(row.created_at||''),updatedAt:String(row.updated_at||''),comments});
async function readEntity(db,type,id){const result=await db.execute({sql:`SELECT * FROM ${ENTITY_TABLE} WHERE entity_type=? AND entity_id=? LIMIT 1`,args:[type,id]});return result.rows?.[0]||null}
async function readThread(db,id){const result=await db.execute({sql:`SELECT * FROM ${THREAD_TABLE} WHERE id=? LIMIT 1`,args:[id]});return result.rows?.[0]||null}
async function listEntities(db){const result=await db.execute(`SELECT * FROM ${ENTITY_TABLE} ORDER BY updated_at DESC`);return(result.rows||[]).map(entityFromRow)}
async function listThreads(db){
  const [threads,comments]=await Promise.all([db.execute(`SELECT * FROM ${THREAD_TABLE} ORDER BY updated_at DESC,created_at DESC`),db.execute(`SELECT * FROM ${COMMENT_TABLE} ORDER BY created_at ASC,id ASC`)]);
  const grouped=new Map();
  for(const row of comments.rows||[]){const comment=commentFromRow(row),list=grouped.get(comment.threadId)||[];list.push(comment);grouped.set(comment.threadId,list)}
  return(threads.rows||[]).map(row=>threadFromRow(row,grouped.get(String(row.id))||[]));
}
async function listEvents(db,limit=100){const bounded=Math.max(1,Math.min(250,Number(limit)||100));const result=await db.execute({sql:`SELECT id,entity_type,entity_id,action,payload_json,created_at FROM ${EVENT_TABLE} ORDER BY id DESC LIMIT ?`,args:[bounded]});return(result.rows||[]).map(row=>({id:Number(row.id),entityType:String(row.entity_type),entityId:String(row.entity_id),action:String(row.action),payload:JSON.parse(String(row.payload_json||'{}')),createdAt:String(row.created_at)}))}
async function recordEvent(db,{entityType,entityId,action,payload,createdAt=new Date().toISOString()}){await db.execute({sql:`INSERT INTO ${EVENT_TABLE}(entity_type,entity_id,action,payload_json,created_at) VALUES(?,?,?,?,?)`,args:[entityType,entityId,action,JSON.stringify(payload||{}),createdAt]});console.info('[Yakolak D1 review activity]',JSON.stringify({entityType,entityId,action,...payload,createdAt}))}
async function threadWithComments(db,id){const [thread,comments]=await Promise.all([readThread(db,id),db.execute({sql:`SELECT * FROM ${COMMENT_TABLE} WHERE thread_id=? ORDER BY created_at ASC,id ASC`,args:[id]})]);if(!thread)throw new Error('thread_not_found');return threadFromRow(thread,(comments.rows||[]).map(commentFromRow))}

async function migrateLegacyNotes(db){
  const result=await db.execute(`SELECT entity_type,entity_id,notes,updated_at FROM ${ENTITY_TABLE} WHERE TRIM(notes)<>''`);
  for(const row of result.rows||[]){
    const entityType=String(row.entity_type),entityId=String(row.entity_id),notes=String(row.notes||'').trim();
    if(!notes)continue;
    const threadId=`legacy:${entityType}:${entityId}`,existing=await readThread(db,threadId);
    const createdAt=String(row.updated_at||new Date().toISOString()),resolution=LEGACY_RESOLUTIONS[`${entityType}:${entityId}`]||'';
    if(!existing){
      const status=resolution?'ready_for_review':'open',now=new Date().toISOString();
      await db.execute({sql:`INSERT INTO ${THREAD_TABLE}(id,entity_type,entity_id,status,title,legacy_source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,args:[threadId,entityType,entityId,status,cleanText(notes.split(/\n/)[0],100),'entity_notes_v1',createdAt,now]});
      await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[`${threadId}:reviewer`,threadId,'reviewer','legacy',notes,createdAt]});
      if(resolution)await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[`${threadId}:developer`,threadId,'developer','implementation',resolution,now]});
    }else{
      await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[`${threadId}:reviewer`,threadId,'reviewer','legacy',notes,createdAt]});
      if(resolution)await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[`${threadId}:developer`,threadId,'developer','implementation',resolution,createdAt]});
    }
  }
}
async function reconcileReviewerFollowups(db){
  await db.execute(`UPDATE ${THREAD_TABLE} AS t SET status='needs_changes',updated_at=(SELECT MAX(c.created_at) FROM ${COMMENT_TABLE} c WHERE c.thread_id=t.id AND c.author_role='reviewer' AND c.kind IN ('reply','comment')) WHERE t.status IN ('ready_for_review','approved') AND EXISTS (SELECT 1 FROM ${COMMENT_TABLE} c WHERE c.thread_id=t.id AND c.author_role='reviewer' AND c.kind IN ('reply','comment') AND c.created_at>COALESCE((SELECT MAX(d.created_at) FROM ${COMMENT_TABLE} d WHERE d.thread_id=t.id AND d.kind='decision'),t.created_at))`);
}

const CURRENT_IMPLEMENTATIONS={
  'legacy:scene:clean-entry':{id:'implementation:review-center:clean-entry',body:'تمت معالجة التعقيبات الحالية: أصبح الزوم أوت أوسع ومتمركزًا فوق الطاولة ليكشف الغرفة كاملة، ثم ينتقل إلى جدار الشعارات بحركة واحدة مستمرة دون قطع. التغيير جاهز لمراجعتك.'},
  'legacy:scene:unboxing-intro':{id:'implementation:review-center:unboxing-intro',body:'تمت معالجة التعقيب الحالي: عُزل إنترو فك العلبة عن النقر واللمس بالكامل، ومُنعت بقايا التحديد أو واجهات الإعداد من الظهور أثناء المشهد. التغيير جاهز لمراجعتك.'}
};
async function resolveCurrentImplementations(db){
  for(const [threadId,item] of Object.entries(CURRENT_IMPLEMENTATIONS)){
    const thread=await readThread(db,threadId);if(!thread)continue;
    const found=await db.execute({sql:`SELECT id FROM ${COMMENT_TABLE} WHERE id=? LIMIT 1`,args:[item.id]});
    if(found.rows?.[0])continue;
    const now=new Date().toISOString();
    await db.execute({sql:`INSERT INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[item.id,threadId,'developer','implementation',item.body,now]});
    await db.execute({sql:`UPDATE ${THREAD_TABLE} SET status='ready_for_review',updated_at=? WHERE id=?`,args:[now,threadId]});
    await recordEvent(db,{entityType:String(thread.entity_type),entityId:String(thread.entity_id),action:'implementation_ready',payload:{threadId,commentId:item.id,body:item.body},createdAt:now});
  }
}

async function saveEntity(db,input){
  const previous=await readEntity(db,input.entityType,input.entityId),now=new Date().toISOString(),old=previous?entityFromRow(previous):null,notes=input.notesProvided?input.notes:(old?.notes||''),version=(old?.version||0)+1;
  await db.execute({sql:`INSERT INTO ${ENTITY_TABLE}(entity_type,entity_id,source_key,display_name,notes,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET source_key=excluded.source_key,display_name=excluded.display_name,notes=excluded.notes,version=${ENTITY_TABLE}.version+1,updated_at=excluded.updated_at`,args:[input.entityType,input.entityId,input.sourceKey,input.displayName,notes,version,old?.createdAt||now,now]});
  const changes={};if(!old||old.displayName!==input.displayName)changes.displayName={from:old?.displayName||'',to:input.displayName};if(input.notesProvided&&(!old||old.notes!==notes))changes.notes={from:old?.notes||'',to:notes};if(!old||old.sourceKey!==input.sourceKey)changes.sourceKey={from:old?.sourceKey||'',to:input.sourceKey};if(Object.keys(changes).length)await recordEvent(db,{entityType:input.entityType,entityId:input.entityId,action:'save_entity',payload:{changes},createdAt:now});return entityFromRow(await readEntity(db,input.entityType,input.entityId));
}
async function createThread(db,body){
  const identity=validateEntityIdentity(body),text=cleanText(body.body,12_000);if(!text)throw new Error('empty_comment');const now=new Date().toISOString(),threadId=body.threadId?cleanId(body.threadId):`thread:${randomUUID()}`,commentId=body.commentId?cleanId(body.commentId):`comment:${randomUUID()}`,role=validateRole(body.authorRole,'reviewer');
  await db.execute({sql:`INSERT OR IGNORE INTO ${THREAD_TABLE}(id,entity_type,entity_id,status,title,legacy_source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,args:[threadId,identity.entityType,identity.entityId,'open',cleanText(body.title||text.split(/\n/)[0],100),null,now,now]});
  await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[commentId,threadId,role,'comment',text,now]});
  await recordEvent(db,{...identity,action:'create_thread',payload:{threadId,commentId,authorRole:role,body:text},createdAt:now});return threadWithComments(db,threadId);
}
async function addComment(db,body){
  const threadId=cleanId(body.threadId),thread=await readThread(db,threadId);if(!thread)throw new Error('thread_not_found');const text=cleanText(body.body,12_000);if(!text)throw new Error('empty_comment');const now=new Date().toISOString(),commentId=body.commentId?cleanId(body.commentId):`comment:${randomUUID()}`,role=validateRole(body.authorRole,'reviewer'),kind=validateKind(body.kind,'reply');
  await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[commentId,threadId,role,kind,text,now]});
  const reopen=role==='reviewer'&&['ready_for_review','approved','rejected'].includes(String(thread.status));
  await db.execute({sql:`UPDATE ${THREAD_TABLE} SET status=?,updated_at=? WHERE id=?`,args:[reopen?'needs_changes':String(thread.status),now,threadId]});
  await recordEvent(db,{entityType:String(thread.entity_type),entityId:String(thread.entity_id),action:'add_comment',payload:{threadId,commentId,authorRole:role,kind,body:text,reopened:reopen},createdAt:now});return threadWithComments(db,threadId);
}
async function setThreadStatus(db,body){
  const threadId=cleanId(body.threadId),thread=await readThread(db,threadId);if(!thread)throw new Error('thread_not_found');const status=validateStatus(body.status),now=new Date().toISOString(),text=cleanText(body.body,12_000),role=validateRole(body.authorRole,status==='ready_for_review'||status==='in_progress'?'developer':'reviewer');
  await db.execute({sql:`UPDATE ${THREAD_TABLE} SET status=?,updated_at=? WHERE id=?`,args:[status,now,threadId]});let commentId='';if(text){commentId=body.commentId?cleanId(body.commentId):`comment:${randomUUID()}`;await db.execute({sql:`INSERT OR IGNORE INTO ${COMMENT_TABLE}(id,thread_id,author_role,kind,body,created_at) VALUES(?,?,?,?,?,?)`,args:[commentId,threadId,role,'decision',text,now]})}
  await recordEvent(db,{entityType:String(thread.entity_type),entityId:String(thread.entity_id),action:'set_status',payload:{threadId,status,authorRole:role,commentId,body:text},createdAt:now});return threadWithComments(db,threadId);
}
function statusFor(error){if(error?.message==='payload_too_large')return 413;if(['invalid_entity','invalid_payload','invalid_id','invalid_status','invalid_role','invalid_kind','empty_comment'].includes(error?.message))return 400;if(error?.message==='thread_not_found')return 404;if(error?.message==='forbidden_origin')return 403;return 500}
export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}const db=getClient();if(!db){json(res,503,{ok:false,error:'developer_store_unavailable'});return}
  try{
    await ensureTables(db);await migrateLegacyNotes(db);await reconcileReviewerFollowups(db);await resolveCurrentImplementations(db);
    if(req.method==='GET'){const [entities,threads]=await Promise.all([listEntities(db),listThreads(db)]),payload={ok:true,entities,threads,statuses:[...THREAD_STATUSES]};if(String(req.query?.events||'')==='1')payload.events=await listEvents(db,req.query?.limit);json(res,200,payload);return}
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}if(!sameOrigin(req))throw new Error('forbidden_origin');let body;try{body=parseBody(req)}catch{throw new Error('invalid_payload')}const action=cleanText(body.action||'save_entity',40);
    if(action==='save_entity')json(res,200,{ok:true,entity:await saveEntity(db,validateEntity(body))});else if(action==='create_thread')json(res,200,{ok:true,thread:await createThread(db,body)});else if(action==='add_comment')json(res,200,{ok:true,thread:await addComment(db,body)});else if(action==='set_status')json(res,200,{ok:true,thread:await setThreadStatus(db,body)});else throw new Error('invalid_payload');
  }catch(error){const status=statusFor(error);if(status>=500)console.error('[Yakolak] Developer D1 review store failed',error);json(res,status,{ok:false,error:status>=500?'developer_store_error':error.message})}
}
