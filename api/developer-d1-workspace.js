import {createClient} from '@tursodatabase/serverless/compat';

const BOARD_TABLE='yakolak_developer_d1_whiteboards';
const REQUEST_TABLE='yakolak_developer_d1_requests';
const COMMENT_TABLE='yakolak_developer_d1_request_comments';
const EVENT_TABLE='yakolak_developer_d1_workspace_events';
const BOARD_KEY='published-scenes';
const MAX_BODY_BYTES=260_000;
const REQUEST_KINDS=new Set(['scene','element']);
const REQUEST_STATUSES=new Set(['requested','in_review','accepted','rejected','implemented']);
const AUTHOR_ROLES=new Set(['reviewer','developer','system']);
let client;
let tablesReady;

function json(res,status,payload){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store, max-age=0');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.end(JSON.stringify(payload))}
function getClient(){const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;if(!url||!authToken)return null;client||=createClient({url,authToken});return client}
async function ensureTables(db){
  tablesReady||=(async()=>{
    await db.execute(`CREATE TABLE IF NOT EXISTS ${BOARD_TABLE} (board_key TEXT PRIMARY KEY,board_json TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${REQUEST_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT,request_kind TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',scenario TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'requested',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${COMMENT_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER NOT NULL,author_role TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)`);
    await Promise.all([
      db.execute(`CREATE INDEX IF NOT EXISTS idx_${REQUEST_TABLE}_updated ON ${REQUEST_TABLE}(updated_at DESC)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_${COMMENT_TABLE}_request ON ${COMMENT_TABLE}(request_id,created_at ASC)`),
      db.execute(`CREATE INDEX IF NOT EXISTS idx_${EVENT_TABLE}_created ON ${EVENT_TABLE}(created_at DESC)`)
    ]);
  })();
  await tablesReady;
}
function sameOrigin(req){const origin=String(req.headers.origin||''),host=String(req.headers['x-forwarded-host']||req.headers.host||'');if(!origin||!host)return true;try{return new URL(origin).host===host}catch{return false}}
const cleanText=(value,max)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
function parseBody(req){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)throw new Error('payload_too_large');return raw?JSON.parse(raw):{}}
function parseJson(text,fallback){try{return JSON.parse(String(text||''))}catch{return fallback}}
const commentFromRow=row=>({id:Number(row.id),requestId:Number(row.request_id),authorRole:String(row.author_role),body:String(row.body||''),createdAt:String(row.created_at||'')});
const requestFromRow=(row,comments=[])=>({id:Number(row.id),kind:String(row.request_kind),title:String(row.title),description:String(row.description||''),scenario:String(row.scenario||''),status:String(row.status||'requested'),createdAt:String(row.created_at||''),updatedAt:String(row.updated_at||''),comments});
async function logEvent(db,action,payload){const now=new Date().toISOString();await db.execute({sql:`INSERT INTO ${EVENT_TABLE}(action,payload_json,created_at) VALUES(?,?,?)`,args:[action,JSON.stringify(payload),now]});console.info('[Yakolak D1 workspace]',JSON.stringify({action,...payload,createdAt:now}))}
async function requestWithComments(db,id){const [request,comments]=await Promise.all([db.execute({sql:`SELECT * FROM ${REQUEST_TABLE} WHERE id=? LIMIT 1`,args:[id]}),db.execute({sql:`SELECT * FROM ${COMMENT_TABLE} WHERE request_id=? ORDER BY created_at ASC,id ASC`,args:[id]})]);if(!request.rows?.[0])throw new Error('request_not_found');return requestFromRow(request.rows[0],(comments.rows||[]).map(commentFromRow))}
async function readWorkspace(db){
  const [boardResult,requestResult,commentResult]=await Promise.all([db.execute({sql:`SELECT board_json,version,updated_at FROM ${BOARD_TABLE} WHERE board_key=? LIMIT 1`,args:[BOARD_KEY]}),db.execute(`SELECT * FROM ${REQUEST_TABLE} ORDER BY updated_at DESC,id DESC`),db.execute(`SELECT * FROM ${COMMENT_TABLE} ORDER BY created_at ASC,id ASC`)]);
  const grouped=new Map();for(const row of commentResult.rows||[]){const comment=commentFromRow(row),list=grouped.get(comment.requestId)||[];list.push(comment);grouped.set(comment.requestId,list)}
  const row=boardResult.rows?.[0];return{board:row?parseJson(row.board_json,null):null,boardVersion:Number(row?.version||0),boardUpdatedAt:String(row?.updated_at||''),requests:(requestResult.rows||[]).map(item=>requestFromRow(item,grouped.get(Number(item.id))||[]))};
}
async function resolveKnownRequests(db){
  const known=[
    {id:1,title:'مشهد اختيار اللون',message:'تمت إضافة مشهد مستقل لاختيار اللون داخل نسخة المطور، مرتبط بإعداد اللعبة الحقيقي.'},
    {id:2,title:'مشهد اختيار عدد اللاعبين',message:'تمت إضافة مشهد مستقل لاختيار عدد اللاعبين داخل نسخة المطور، مرتبط بإعداد اللعبة الحقيقي.'},
    {id:3,title:'بعد انشاء الطلب لا اعرف لمازا يفتح الوايت بورد الغي دا السلوك',message:'تم إلغاء فتح الوايت بورد تلقائيًا بعد حفظ الطلب. يبقى المستخدم في نافذة الطلبات ويمكنه فتح المخطط بنفسه.'}
  ];
  for(const item of known){
    const result=await db.execute({sql:`SELECT id,title,status FROM ${REQUEST_TABLE} WHERE id=? LIMIT 1`,args:[item.id]});const row=result.rows?.[0];if(!row||String(row.title)!==item.title)continue;
    const now=new Date().toISOString();
    await db.execute({sql:`UPDATE ${REQUEST_TABLE} SET status='implemented',updated_at=? WHERE id=? AND status<>'rejected'`,args:[now,item.id]});
    const exists=await db.execute({sql:`SELECT 1 FROM ${COMMENT_TABLE} WHERE request_id=? AND body=? LIMIT 1`,args:[item.id,item.message]});
    if(!exists.rows?.length)await db.execute({sql:`INSERT INTO ${COMMENT_TABLE}(request_id,author_role,body,created_at) VALUES(?,?,?,?)`,args:[item.id,'developer',item.message,now]});
  }
}
async function saveBoard(db,body){if(!body.board||typeof body.board!=='object'||Array.isArray(body.board))throw new Error('invalid_board');const boardJson=JSON.stringify(body.board);if(Buffer.byteLength(boardJson,'utf8')>220_000)throw new Error('board_too_large');const now=new Date().toISOString();await db.execute({sql:`INSERT INTO ${BOARD_TABLE}(board_key,board_json,version,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(board_key) DO UPDATE SET board_json=excluded.board_json,version=${BOARD_TABLE}.version+1,updated_at=excluded.updated_at`,args:[BOARD_KEY,boardJson,1,now,now]});await logEvent(db,'board_save',{boardKey:BOARD_KEY,nodeCount:Number(body.nodeCount||0),connectionCount:Number(body.connectionCount||0)});const result=await db.execute({sql:`SELECT board_json,version,updated_at FROM ${BOARD_TABLE} WHERE board_key=? LIMIT 1`,args:[BOARD_KEY]});const row=result.rows[0];return{board:parseJson(row.board_json,{}),version:Number(row.version),updatedAt:String(row.updated_at)}}
async function createRequest(db,body){const kind=cleanText(body.kind,16),title=cleanText(body.title,120),description=cleanText(body.description,6000),scenario=cleanText(body.scenario,3000);if(!REQUEST_KINDS.has(kind)||!title)throw new Error('invalid_request');const now=new Date().toISOString(),result=await db.execute({sql:`INSERT INTO ${REQUEST_TABLE}(request_kind,title,description,scenario,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING *`,args:[kind,title,description,scenario,'requested',now,now]});const request=requestFromRow(result.rows[0]);await logEvent(db,'request_create',{requestId:request.id,kind,title});return request}
async function updateRequestStatus(db,body){const id=Number(body.requestId),status=cleanText(body.status,32);if(!Number.isInteger(id)||id<1||!REQUEST_STATUSES.has(status))throw new Error('invalid_request_status');const now=new Date().toISOString(),result=await db.execute({sql:`UPDATE ${REQUEST_TABLE} SET status=?,updated_at=? WHERE id=? RETURNING *`,args:[status,now,id]});if(!result.rows?.[0])throw new Error('request_not_found');await logEvent(db,'request_status',{requestId:id,status});return requestWithComments(db,id)}
async function addRequestComment(db,body){const id=Number(body.requestId),role=cleanText(body.authorRole||'reviewer',24),text=cleanText(body.body,12_000);if(!Number.isInteger(id)||id<1||!AUTHOR_ROLES.has(role)||!text)throw new Error('invalid_request_comment');const existing=await db.execute({sql:`SELECT status FROM ${REQUEST_TABLE} WHERE id=? LIMIT 1`,args:[id]});if(!existing.rows?.[0])throw new Error('request_not_found');const now=new Date().toISOString();await db.execute({sql:`INSERT INTO ${COMMENT_TABLE}(request_id,author_role,body,created_at) VALUES(?,?,?,?)`,args:[id,role,text,now]});const current=String(existing.rows[0].status),reopen=role==='reviewer'&&['implemented','accepted','rejected'].includes(current);await db.execute({sql:`UPDATE ${REQUEST_TABLE} SET status=?,updated_at=? WHERE id=?`,args:[reopen?'in_review':current,now,id]});await logEvent(db,'request_comment',{requestId:id,authorRole:role,body:text,reopened:reopen});return requestWithComments(db,id)}
function statusFor(error){if(['payload_too_large','board_too_large'].includes(error?.message))return 413;if(['invalid_board','invalid_request','invalid_request_status','invalid_request_comment'].includes(error?.message))return 400;if(error?.message==='request_not_found')return 404;if(error?.message==='forbidden_origin')return 403;return 500}
export default async function handler(req,res){res.setHeader('allow','GET, POST, OPTIONS');if(req.method==='OPTIONS'){res.statusCode=204;res.end();return}const db=getClient();if(!db){json(res,503,{ok:false,error:'developer_workspace_unavailable'});return}try{await ensureTables(db);await resolveKnownRequests(db);if(req.method==='GET'){json(res,200,{ok:true,...await readWorkspace(db)});return}if(req.method!=='POST'){json(res,405,{ok:false,error:'method_not_allowed'});return}if(!sameOrigin(req))throw new Error('forbidden_origin');let body;try{body=parseBody(req)}catch{throw new Error('invalid_request')}const action=cleanText(body.action,40);if(action==='board_save')json(res,200,{ok:true,workspace:await saveBoard(db,body)});else if(action==='request_create')json(res,200,{ok:true,request:await createRequest(db,body)});else if(action==='request_status')json(res,200,{ok:true,request:await updateRequestStatus(db,body)});else if(action==='request_comment')json(res,200,{ok:true,request:await addRequestComment(db,body)});else throw new Error('invalid_request')}catch(error){const status=statusFor(error);if(status>=500)console.error('[Yakolak] Developer D1 workspace failed',error);json(res,status,{ok:false,error:status>=500?'developer_workspace_error':error.message})}}
