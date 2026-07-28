import { createClient } from '@tursodatabase/serverless/compat';

const ENTITY_TABLE='yakolak_developer_d1_entities';
const EVENT_TABLE='yakolak_developer_d1_events';
const MAX_BODY_BYTES=24_000;
const ENTITY_TYPES=new Set(['scene','element']);
const ID_PATTERN=/^[a-z0-9][a-z0-9-]{1,63}$/;
let client;
let tablesReady;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.end(payload==null?'':JSON.stringify(payload));
}

function getClient(){
  const url=process.env.TURSO_DATABASE_URL;
  const authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)return null;
  client||=createClient({url,authToken});
  return client;
}

async function ensureTables(db){
  tablesReady||=Promise.all([
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${ENTITY_TABLE} (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        source_key TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(entity_type,entity_id)
      )
    `),
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
  ]);
  await tablesReady;
}

function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  if(!raw)return{};
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');
  return JSON.parse(raw);
}

function cleanText(value,max){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}

function validateEntity(body){
  const entityType=cleanText(body.entityType,16);
  const entityId=cleanText(body.entityId,64);
  if(!ENTITY_TYPES.has(entityType)||!ID_PATTERN.test(entityId))throw new Error('invalid_entity');
  return{
    entityType,
    entityId,
    sourceKey:cleanText(body.sourceKey,180),
    displayName:cleanText(body.displayName,100),
    notes:cleanText(body.notes,16_000)
  };
}

function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!origin||!host)return true;
  try{return new URL(origin).host===host}catch{return false}
}

function entityFromRow(row){
  return{
    entityType:String(row.entity_type),
    entityId:String(row.entity_id),
    sourceKey:String(row.source_key||''),
    displayName:String(row.display_name||''),
    notes:String(row.notes||''),
    version:Number(row.version||1),
    createdAt:String(row.created_at||''),
    updatedAt:String(row.updated_at||'')
  };
}

async function readEntity(db,entityType,entityId){
  const result=await db.execute({
    sql:`SELECT * FROM ${ENTITY_TABLE} WHERE entity_type=? AND entity_id=? LIMIT 1`,
    args:[entityType,entityId]
  });
  return result.rows?.[0]||null;
}

async function listEntities(db){
  const result=await db.execute(`SELECT * FROM ${ENTITY_TABLE} ORDER BY updated_at DESC`);
  return(result.rows||[]).map(entityFromRow);
}

async function listEvents(db,limit=100){
  const bounded=Math.max(1,Math.min(250,Number(limit)||100));
  const result=await db.execute({
    sql:`SELECT id,entity_type,entity_id,action,payload_json,created_at FROM ${EVENT_TABLE} ORDER BY id DESC LIMIT ?`,
    args:[bounded]
  });
  return(result.rows||[]).map(row=>({
    id:Number(row.id),entityType:String(row.entity_type),entityId:String(row.entity_id),action:String(row.action),
    payload:JSON.parse(String(row.payload_json||'{}')),createdAt:String(row.created_at)
  }));
}

async function saveEntity(db,input){
  const previous=await readEntity(db,input.entityType,input.entityId);
  const now=new Date().toISOString();
  const previousEntity=previous?entityFromRow(previous):null;
  const version=(previousEntity?.version||0)+1;
  await db.execute({
    sql:`
      INSERT INTO ${ENTITY_TABLE}
        (entity_type,entity_id,source_key,display_name,notes,version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET
        source_key=excluded.source_key,
        display_name=excluded.display_name,
        notes=excluded.notes,
        version=${ENTITY_TABLE}.version+1,
        updated_at=excluded.updated_at
    `,
    args:[input.entityType,input.entityId,input.sourceKey,input.displayName,input.notes,version,previousEntity?.createdAt||now,now]
  });
  const changes={};
  if(!previousEntity||previousEntity.displayName!==input.displayName)changes.displayName={from:previousEntity?.displayName||'',to:input.displayName};
  if(!previousEntity||previousEntity.notes!==input.notes)changes.notes={from:previousEntity?.notes||'',to:input.notes};
  if(!previousEntity||previousEntity.sourceKey!==input.sourceKey)changes.sourceKey={from:previousEntity?.sourceKey||'',to:input.sourceKey};
  if(Object.keys(changes).length){
    await db.execute({
      sql:`INSERT INTO ${EVENT_TABLE}(entity_type,entity_id,action,payload_json,created_at) VALUES(?,?,?,?,?)`,
      args:[input.entityType,input.entityId,'save',JSON.stringify({changes}),now]
    });
    console.info('[Yakolak D1 shared feedback]',JSON.stringify({entityType:input.entityType,entityId:input.entityId,changes,createdAt:now}));
  }
  const saved=await readEntity(db,input.entityType,input.entityId);
  return entityFromRow(saved);
}

function statusFor(error){
  if(error?.message==='payload_too_large')return 413;
  if(error?.message==='invalid_entity'||error?.message==='invalid_payload')return 400;
  if(error?.message==='forbidden_origin')return 403;
  return 500;
}

export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  const db=getClient();
  if(!db){json(res,503,{ok:false,error:'developer_store_unavailable'});return}
  try{
    await ensureTables(db);
    if(req.method==='GET'){
      const wantsEvents=String(req.query?.events||'')==='1';
      const entities=await listEntities(db);
      const payload={ok:true,entities};
      if(wantsEvents)payload.events=await listEvents(db,req.query?.limit);
      json(res,200,payload);
      return;
    }
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}
    if(!sameOrigin(req))throw new Error('forbidden_origin');
    let body;
    try{body=parseBody(req)}catch{throw new Error('invalid_payload')}
    const entity=await saveEntity(db,validateEntity(body));
    json(res,200,{ok:true,entity});
  }catch(error){
    const status=statusFor(error);
    if(status>=500)console.error('[Yakolak] Developer D1 store failed',error);
    json(res,status,{ok:false,error:status>=500?'developer_store_error':error.message});
  }
}
