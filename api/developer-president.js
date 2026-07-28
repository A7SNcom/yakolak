import {createClient} from '@tursodatabase/serverless/compat';

const DIRECTIVE_TABLE='yakolak_president_directives';
const MESSAGE_TABLE='yakolak_president_messages';
const DECISION_TABLE='yakolak_president_decisions';
const EVENT_TABLE='yakolak_president_events';
const MAX_BODY_BYTES=64_000;
const KINDS=new Set(['instruction','scene','element','architecture']);
const PRIORITIES=new Set(['normal','high','urgent']);
const DECISIONS=new Set(['approved','needs_changes','rejected']);
const ITEM_TYPES=new Set(['directive','review']);
const ID_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{5,159}$/;
let client;
let tablesReady;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.end(JSON.stringify(payload));
}
function portalEnabled(){
  return process.env.VERCEL_ENV!=='production'||process.env.PRESIDENT_PORTAL_PRODUCTION_ENABLED==='1';
}
function getClient(){
  const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)return null;
  client||=createClient({url,authToken});
  return client;
}
async function ensureTables(db){
  tablesReady||=(async()=>{
    await db.execute(`CREATE TABLE IF NOT EXISTS ${DIRECTIVE_TABLE} (id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,context_json TEXT NOT NULL DEFAULT '{}',priority TEXT NOT NULL DEFAULT 'normal',cancelled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${MESSAGE_TABLE} (id TEXT PRIMARY KEY,item_type TEXT NOT NULL,item_id TEXT NOT NULL,author_role TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${DECISION_TABLE} (review_id TEXT PRIMARY KEY,decision TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)`);
    await Promise.all([
      db.execute(`CREATE INDEX IF NOT EXISTS idx_president_directives_updated ON ${DIRECTIVE_TABLE}(updated_at DESC)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_president_messages_item ON ${MESSAGE_TABLE}(item_type,item_id,created_at ASC)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_president_events_created ON ${EVENT_TABLE}(created_at DESC)`)
    ]);
  })();
  await tablesReady;
}
function sameOrigin(req){
  const origin=String(req.headers.origin||''),host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!origin||!host)return true;
  try{return new URL(origin).host===host}catch{return false}
}
function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');
  return raw?JSON.parse(raw):{};
}
const cleanText=(value,max)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
function cleanId(value){const id=cleanText(value,160);if(!ID_PATTERN.test(id))throw new Error('invalid_id');return id}
function cleanContext(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return{title:cleanText(source.title,160),code:cleanText(source.code,240),url:cleanText(source.url,1000)};
}
function parseJson(value,fallback={}){try{return JSON.parse(String(value||''))}catch{return fallback}}
const directiveFromRow=row=>({id:String(row.id),kind:String(row.kind),title:String(row.title),body:String(row.body),context:parseJson(row.context_json,{}),priority:String(row.priority||'normal'),cancelled:Boolean(Number(row.cancelled||0)),createdAt:String(row.created_at),updatedAt:String(row.updated_at)});
const messageFromRow=row=>({id:String(row.id),itemType:String(row.item_type),itemId:String(row.item_id),authorRole:String(row.author_role),body:String(row.body),createdAt:String(row.created_at)});
const decisionFromRow=row=>({reviewId:String(row.review_id),decision:String(row.decision),body:String(row.body||''),createdAt:String(row.created_at),updatedAt:String(row.updated_at)});
async function recordEvent(db,action,payload){
  const createdAt=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${EVENT_TABLE}(action,payload_json,created_at) VALUES(?,?,?)`,args:[action,JSON.stringify(payload||{}),createdAt]});
  console.info('[Yakolak President]',JSON.stringify({action,...payload,createdAt}));
}
async function readAll(db){
  const [directives,messages,decisions]=await Promise.all([
    db.execute(`SELECT * FROM ${DIRECTIVE_TABLE} ORDER BY updated_at DESC,created_at DESC`),
    db.execute(`SELECT * FROM ${MESSAGE_TABLE} ORDER BY created_at ASC,id ASC`),
    db.execute(`SELECT * FROM ${DECISION_TABLE} ORDER BY updated_at DESC`)
  ]);
  return{directives:(directives.rows||[]).map(directiveFromRow),messages:(messages.rows||[]).map(messageFromRow),decisions:(decisions.rows||[]).map(decisionFromRow)};
}
async function createDirective(db,body){
  const id=cleanId(body.id),kind=cleanText(body.kind,32),title=cleanText(body.title,160),text=cleanText(body.body,12_000),priority=cleanText(body.priority||'normal',16),context=cleanContext(body.context);
  if(!KINDS.has(kind)||!PRIORITIES.has(priority)||!title||!text)throw new Error('invalid_directive');
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${DIRECTIVE_TABLE}(id,kind,title,body,context_json,priority,cancelled,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)`,args:[id,kind,title,text,JSON.stringify(context),priority,now,now]});
  await recordEvent(db,'directive_create',{directiveId:id,kind,priority,title});
  const result=await db.execute({sql:`SELECT * FROM ${DIRECTIVE_TABLE} WHERE id=? LIMIT 1`,args:[id]});
  return directiveFromRow(result.rows[0]);
}
async function addMessage(db,body){
  const id=cleanId(body.id),itemType=cleanText(body.itemType,24),itemId=cleanId(body.itemId),text=cleanText(body.body,12_000);
  if(!ITEM_TYPES.has(itemType)||!text)throw new Error('invalid_message');
  if(itemType==='directive'){
    const found=await db.execute({sql:`SELECT id FROM ${DIRECTIVE_TABLE} WHERE id=? LIMIT 1`,args:[itemId]});
    if(!found.rows?.length)throw new Error('directive_not_found');
    await db.execute({sql:`UPDATE ${DIRECTIVE_TABLE} SET updated_at=? WHERE id=?`,args:[new Date().toISOString(),itemId]});
  }
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${MESSAGE_TABLE}(id,item_type,item_id,author_role,body,created_at) VALUES(?,?,?,?,?,?)`,args:[id,itemType,itemId,'president',text,now]});
  await recordEvent(db,'president_message',{messageId:id,itemType,itemId});
  return messageFromRow({id,item_type:itemType,item_id:itemId,author_role:'president',body:text,created_at:now});
}
async function cancelDirective(db,body){
  const id=cleanId(body.directiveId),now=new Date().toISOString();
  const result=await db.execute({sql:`UPDATE ${DIRECTIVE_TABLE} SET cancelled=1,updated_at=? WHERE id=? RETURNING *`,args:[now,id]});
  if(!result.rows?.[0])throw new Error('directive_not_found');
  await recordEvent(db,'directive_cancel',{directiveId:id});
  return directiveFromRow(result.rows[0]);
}
async function saveDecision(db,body){
  const reviewId=cleanId(body.reviewId),decision=cleanText(body.decision,32),text=cleanText(body.body,12_000);
  if(!DECISIONS.has(decision))throw new Error('invalid_decision');
  if(['needs_changes','rejected'].includes(decision)&&!text)throw new Error('decision_requires_comment');
  const previous=await db.execute({sql:`SELECT created_at FROM ${DECISION_TABLE} WHERE review_id=? LIMIT 1`,args:[reviewId]}),now=new Date().toISOString(),createdAt=String(previous.rows?.[0]?.created_at||now);
  await db.execute({sql:`INSERT INTO ${DECISION_TABLE}(review_id,decision,body,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET decision=excluded.decision,body=excluded.body,updated_at=excluded.updated_at`,args:[reviewId,decision,text,createdAt,now]});
  await recordEvent(db,'review_decision',{reviewId,decision});
  const result=await db.execute({sql:`SELECT * FROM ${DECISION_TABLE} WHERE review_id=? LIMIT 1`,args:[reviewId]});
  return decisionFromRow(result.rows[0]);
}
function statusFor(error){
  if(error?.message==='payload_too_large')return 413;
  if(['invalid_id','invalid_directive','invalid_message','invalid_decision','decision_requires_comment','invalid_payload'].includes(error?.message))return 400;
  if(error?.message==='directive_not_found')return 404;
  if(error?.message==='forbidden_origin')return 403;
  if(String(error?.message||'').includes('UNIQUE constraint failed'))return 409;
  return 500;
}
export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  if(!portalEnabled()){json(res,403,{ok:false,error:'president_portal_disabled_in_production'});return}
  const db=getClient();
  if(!db){json(res,503,{ok:false,error:'president_store_unavailable'});return}
  try{
    await ensureTables(db);
    if(req.method==='GET'){json(res,200,{ok:true,channelVersion:1,...await readAll(db)});return}
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}
    if(!sameOrigin(req))throw new Error('forbidden_origin');
    let body;try{body=parseBody(req)}catch{throw new Error('invalid_payload')}
    const action=cleanText(body.action,40);
    if(action==='directive_create')json(res,200,{ok:true,directive:await createDirective(db,body)});
    else if(action==='message_add')json(res,200,{ok:true,message:await addMessage(db,body)});
    else if(action==='directive_cancel')json(res,200,{ok:true,directive:await cancelDirective(db,body)});
    else if(action==='review_decision')json(res,200,{ok:true,decision:await saveDecision(db,body)});
    else throw new Error('invalid_payload');
  }catch(error){
    const status=statusFor(error);
    if(status>=500)console.error('[Yakolak] President portal failed',error);
    json(res,status,{ok:false,error:status>=500?'president_store_error':error.message});
  }
}
