import {createClient} from '@tursodatabase/serverless/compat';

const TABLE='yakolak_developer_d1_comparisons';
const MAX_BODY_BYTES=12_000;
const ITEM_KINDS=new Set(['thread','request']);
let client;
let tableReady;

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
async function ensureTable(db){
  tableReady||=db.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (item_key TEXT PRIMARY KEY,item_kind TEXT NOT NULL,before_url TEXT NOT NULL DEFAULT '',after_url TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)`);
  await tableReady;
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
function cleanKey(value){const key=cleanText(value,220);if(!/^(thread|request):[a-zA-Z0-9:_-]{1,190}$/.test(key))throw new Error('invalid_key');return key}
function cleanKind(value){const kind=cleanText(value,20);if(!ITEM_KINDS.has(kind))throw new Error('invalid_kind');return kind}
function cleanUrl(value){
  const url=cleanText(value,2048);
  if(!url)return'';
  let parsed;
  try{parsed=new URL(url,'https://yakolak.local/')}catch{throw new Error('invalid_url')}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('invalid_url');
  return url;
}
const fromRow=row=>({itemKey:String(row.item_key),itemKind:String(row.item_kind),beforeUrl:String(row.before_url||''),afterUrl:String(row.after_url||''),updatedAt:String(row.updated_at||'')});
async function list(db){const result=await db.execute(`SELECT * FROM ${TABLE} ORDER BY updated_at DESC`);return(result.rows||[]).map(fromRow)}
async function save(db,body){
  const itemKey=cleanKey(body.itemKey),itemKind=cleanKind(body.itemKind),beforeUrl=cleanUrl(body.beforeUrl),afterUrl=cleanUrl(body.afterUrl),updatedAt=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${TABLE}(item_key,item_kind,before_url,after_url,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(item_key) DO UPDATE SET item_kind=excluded.item_kind,before_url=excluded.before_url,after_url=excluded.after_url,updated_at=excluded.updated_at`,args:[itemKey,itemKind,beforeUrl,afterUrl,updatedAt]});
  return{itemKey,itemKind,beforeUrl,afterUrl,updatedAt};
}
function statusFor(error){if(error?.message==='payload_too_large')return 413;if(['invalid_payload','invalid_key','invalid_kind','invalid_url'].includes(error?.message))return 400;if(error?.message==='forbidden_origin')return 403;return 500}

export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  const db=getClient();
  if(!db){json(res,503,{ok:false,error:'developer_store_unavailable'});return}
  try{
    await ensureTable(db);
    if(req.method==='GET'){json(res,200,{ok:true,comparisons:await list(db)});return}
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}
    if(!sameOrigin(req))throw new Error('forbidden_origin');
    let body;
    try{body=parseBody(req)}catch{throw new Error('invalid_payload')}
    if(cleanText(body.action,30)!=='save')throw new Error('invalid_payload');
    json(res,200,{ok:true,comparison:await save(db,body)});
  }catch(error){
    const status=statusFor(error);
    if(status>=500)console.error('[Yakolak] Developer D1 comparison store failed',error);
    json(res,status,{ok:false,error:status>=500?'comparison_store_error':error.message});
  }
}
