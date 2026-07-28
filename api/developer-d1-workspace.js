import {createClient} from '@tursodatabase/serverless/compat';

const BOARD_TABLE='yakolak_developer_d1_whiteboards';
const REQUEST_TABLE='yakolak_developer_d1_requests';
const EVENT_TABLE='yakolak_developer_d1_workspace_events';
const BOARD_KEY='published-scenes';
const MAX_BODY_BYTES=260_000;
const REQUEST_KINDS=new Set(['scene','element']);
const REQUEST_STATUSES=new Set(['requested','in_review','accepted','rejected','implemented']);
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

function getClient(){
  const url=process.env.TURSO_DATABASE_URL;
  const authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)return null;
  client||=createClient({url,authToken});
  return client;
}

async function ensureTables(db){
  tablesReady||=(async()=>{
    await db.execute(`CREATE TABLE IF NOT EXISTS ${BOARD_TABLE} (
      board_key TEXT PRIMARY KEY,
      board_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${REQUEST_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scenario TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${REQUEST_TABLE}_updated ON ${REQUEST_TABLE}(updated_at DESC)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${EVENT_TABLE}_created ON ${EVENT_TABLE}(created_at DESC)`);
  })();
  await tablesReady;
}

function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
  if(!origin||!host)return true;
  try{return new URL(origin).host===host}catch{return false}
}

function cleanText(value,max){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function parseBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');
  return raw?JSON.parse(raw):{};
}
function parseJson(text,fallback){try{return JSON.parse(String(text||''))}catch{return fallback}}
function requestFromRow(row){return{id:Number(row.id),kind:String(row.request_kind),title:String(row.title),description:String(row.description||''),scenario:String(row.scenario||''),status:String(row.status||'requested'),createdAt:String(row.created_at||''),updatedAt:String(row.updated_at||'')}}

async function logEvent(db,action,payload){
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${EVENT_TABLE}(action,payload_json,created_at) VALUES(?,?,?)`,args:[action,JSON.stringify(payload),now]});
  console.info('[Yakolak D1 workspace]',JSON.stringify({action,...payload,createdAt:now}));
}

async function readWorkspace(db){
  const boardResult=await db.execute({sql:`SELECT board_json,version,updated_at FROM ${BOARD_TABLE} WHERE board_key=? LIMIT 1`,args:[BOARD_KEY]});
  const requestResult=await db.execute(`SELECT * FROM ${REQUEST_TABLE} ORDER BY updated_at DESC,id DESC`);
  const row=boardResult.rows?.[0];
  return{board:row?parseJson(row.board_json,null):null,boardVersion:Number(row?.version||0),boardUpdatedAt:String(row?.updated_at||''),requests:(requestResult.rows||[]).map(requestFromRow)};
}

async function saveBoard(db,body){
  if(!body.board||typeof body.board!=='object'||Array.isArray(body.board))throw new Error('invalid_board');
  const boardJson=JSON.stringify(body.board);
  if(Buffer.byteLength(boardJson,'utf8')>220_000)throw new Error('board_too_large');
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO ${BOARD_TABLE}(board_key,board_json,version,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(board_key) DO UPDATE SET board_json=excluded.board_json,version=${BOARD_TABLE}.version+1,updated_at=excluded.updated_at`,args:[BOARD_KEY,boardJson,1,now,now]});
  await logEvent(db,'board_save',{boardKey:BOARD_KEY,nodeCount:Number(body.nodeCount||0),connectionCount:Number(body.connectionCount||0)});
  const result=await db.execute({sql:`SELECT board_json,version,updated_at FROM ${BOARD_TABLE} WHERE board_key=? LIMIT 1`,args:[BOARD_KEY]});
  const row=result.rows[0];
  return{board:parseJson(row.board_json,{}),version:Number(row.version),updatedAt:String(row.updated_at)};
}

async function createRequest(db,body){
  const kind=cleanText(body.kind,16);
  const title=cleanText(body.title,120);
  const description=cleanText(body.description,6000);
  const scenario=cleanText(body.scenario,3000);
  if(!REQUEST_KINDS.has(kind)||!title)throw new Error('invalid_request');
  const now=new Date().toISOString();
  const result=await db.execute({sql:`INSERT INTO ${REQUEST_TABLE}(request_kind,title,description,scenario,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING *`,args:[kind,title,description,scenario,'requested',now,now]});
  const request=requestFromRow(result.rows[0]);
  await logEvent(db,'request_create',{requestId:request.id,kind,title});
  return request;
}

async function updateRequestStatus(db,body){
  const id=Number(body.requestId);
  const status=cleanText(body.status,32);
  if(!Number.isInteger(id)||id<1||!REQUEST_STATUSES.has(status))throw new Error('invalid_request_status');
  const now=new Date().toISOString();
  const result=await db.execute({sql:`UPDATE ${REQUEST_TABLE} SET status=?,updated_at=? WHERE id=? RETURNING *`,args:[status,now,id]});
  if(!result.rows?.[0])throw new Error('request_not_found');
  const request=requestFromRow(result.rows[0]);
  await logEvent(db,'request_status',{requestId:id,status});
  return request;
}

function statusFor(error){
  if(['payload_too_large','board_too_large'].includes(error?.message))return 413;
  if(['invalid_board','invalid_request','invalid_request_status'].includes(error?.message))return 400;
  if(error?.message==='request_not_found')return 404;
  if(error?.message==='forbidden_origin')return 403;
  return 500;
}

export default async function handler(req,res){
  res.setHeader('allow','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}
  const db=getClient();
  if(!db){json(res,503,{ok:false,error:'developer_workspace_unavailable'});return}
  try{
    await ensureTables(db);
    if(req.method==='GET'){json(res,200,{ok:true,...await readWorkspace(db)});return}
    if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}
    if(!sameOrigin(req))throw new Error('forbidden_origin');
    let body;
    try{body=parseBody(req)}catch{throw new Error('invalid_request')}
    const action=cleanText(body.action,40);
    if(action==='board_save'){json(res,200,{ok:true,workspace:await saveBoard(db,body)});return}
    if(action==='request_create'){json(res,200,{ok:true,request:await createRequest(db,body)});return}
    if(action==='request_status'){json(res,200,{ok:true,request:await updateRequestStatus(db,body)});return}
    throw new Error('invalid_request');
  }catch(error){
    const status=statusFor(error);
    if(status>=500)console.error('[Yakolak] Developer D1 workspace failed',error);
    json(res,status,{ok:false,error:status>=500?'developer_workspace_error':error.message});
  }
}
