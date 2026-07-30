import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const requireTokens=(source,tokens,label)=>{for(const token of tokens)if(!source.includes(token))fail(`${label} missing ${token}`)};

const html=read('developer.html'),css=read('src/developer-president.css'),ui=read('src/developer-president.js'),api=read('api/developer-president.js');
const manifest=JSON.parse(read('src/president-portal-manifest.json'));

requireTokens(html,[
  'إدارة تطوير ياكلك','id="connectionText"','id="sheetLink"','id="countAll"','id="countProgress"','id="countReview"','id="countDone"',
  'id="searchInput"','id="newTaskButton"','id="taskList"','id="taskDialog"','id="taskStatus"','id="taskFeed"','id="commentForm"','id="editorDialog"'
],'Arabic task interface');
requireTokens(css,['.summary-card','.task-row','.status-in_progress','.feed-tabs','.notice','.task-dialog','.editor-dialog','@media(max-width:760px)','[hidden]{display:none!important}'],'compact responsive styles');
requireTokens(ui,[
  "const API_URL='./api/developer-president'","in_progress:'قيد التنفيذ'",'function filteredTasks()','function renderTasks()','function renderFeed()','function openTask(task)',
  "action:'task_create'","action:'task_update'","action:'task_status'","action:'task_delete'","action:'task_comment'",'state.writable','sheetLink.href=state.sheetUrl'
],'Google Sheets task workflow');
requireTokens(api,[
  "const TAB='إدارة التطوير'",'GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY','https://sheets.googleapis.com/v4/spreadsheets/','/gviz/tq',
  "'مهمة'","'رد'","'تحديث'","'محتوى'","قيد التنفيذ","للمراجعة","مكتملة","محذوفة","action==='task_create'","action==='task_status'","action==='task_work_add'",
  'RASHED_PORTAL_KEY','YAKOLAK_WORKER_KEY','sheets_write_not_configured'
],'Google Sheets API');
for(const stale of ['@tursodatabase','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','yakolak_development_tasks','CREATE TABLE'])if(api.includes(stale))fail(`Turso remains in API: ${stale}`);
if(manifest.version!==7||manifest.database?.provider!=='google-sheets'||manifest.database?.sheet!=='إدارة التطوير'||manifest.database?.spreadsheetId!=='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c')fail('Google Sheets manifest mismatch');
if(manifest.views?.join(',')!=='summary,tasks,conversation,work-log'||manifest.publicReadFallback!==true)fail('minimal interface contract mismatch');

console.log('Arabic Google Sheets development workspace verified.');
