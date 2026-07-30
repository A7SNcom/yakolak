import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const fail=message=>{throw new Error(`[president-portal] ${message}`)};
const requireTokens=(source,tokens,label)=>{for(const token of tokens)if(!source.includes(token))fail(`${label} missing ${token}`)};

const html=read('developer.html');
const css=read('src/developer-president.css');
const ui=read('src/developer-president.js');
const api=read('api/developer-president.js');
const packageJson=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('src/president-portal-manifest.json'));
const documentation=read('docs/GOOGLE_SHEETS_DEVELOPMENT_DATABASE.md');

requireTokens(html,[
  'id="searchInput"','id="filters"','id="contentGrid"','id="contentModal"','id="databaseLink"','id="refreshButton"',
  'id="previewItemSelect"','id="previewVersionSelect"','فتح قاعدة البيانات','قاعدة البيانات الكاملة: Google Sheets'
],'full Google Sheet workspace');
for(const stale of ['id="editorModal"','id="openGlobalTask"','sortablejs','president-kanban','d4PreviewFrame'])if(html.includes(stale))fail(`stale interface remains: ${stale}`);

requireTokens(css,['.workspace-title','.database-actions','.database-link','.content-card','.task-row','.status-in_progress','.preview-loading','.preview-frame.ready','@media(max-width:760px)','[hidden]{display:none!important}'],'workspace styles');
requireTokens(ui,[
  "const API_URL='./api/developer-president'","const SHEET_URL='https://docs.google.com/spreadsheets/d/1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c/edit'",
  'function fuzzyScore(query,value)','function previewSourcesFor(item)','function previewUrlFor(item,variant)','payload.content','payload.tasks','payload.sheetUrl','Google Sheets كامل'
],'full Google Sheet interface');
for(const stale of ["from './developer-d4-registry.js'",'sceneDefinitions','elementDefinitions','contractFor('])if(ui.includes(stale))fail(`code content database remains: ${stale}`);

requireTokens(api,[
  "const SPREADSHEET_ID='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c'","name:'المهام'","name:'المحتوى'","name:'المعاينات'","name:'المحادثات'","name:'سجل العمل'","name:'الإعدادات'",
  'gviz/tq?tqx=out:csv','function buildTasks(rows)','function buildContent(rows,variantRows)','function buildComments(rows)','function buildWork(rows)','function buildSettings(rows)',
  "sourceOfTruth:'google-sheets'",'YAKOLAK_SHEETS_SCRIPT_URL','YAKOLAK_SHEETS_API_TOKEN','task_create','task_update','task_status','task_delete','task_comment','task_work_add','content_update','content_delete'
],'full Google Sheet API');
for(const stale of ['@tursodatabase','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','CREATE TABLE','yakolak_development_tasks'])if(api.includes(stale))fail(`legacy database remains: ${stale}`);
if(packageJson.dependencies?.['@tursodatabase/serverless'])fail('Turso dependency remains');

if(manifest.version!==8)fail('manifest version mismatch');
if(manifest.database?.provider!=='google-sheets'||manifest.database?.spreadsheetId!=='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c'||manifest.database?.sourceOfTruth!=='google-sheets')fail('Google Sheet manifest mismatch');
const tabs=['المهام','المحتوى','المعاينات','المحادثات','سجل العمل','الإعدادات'];
if(manifest.database?.tabs?.join(',')!==tabs.join(','))fail('database tabs mismatch');
if(!manifest.database?.contentInSheets||!manifest.database?.previewsInSheets)fail('content database is not fully in Sheets');
if(manifest.database?.documentation!=='docs/GOOGLE_SHEETS_DEVELOPMENT_DATABASE.md')fail('database documentation link mismatch');
requireTokens(documentation,['المهام','المحتوى','المعاينات','المحادثات','سجل العمل','الإعدادات','YAKOLAK_SHEETS_SCRIPT_URL','YAKOLAK_SHEETS_API_TOKEN'],'database documentation');

console.log('Tasks, content, preview variants, conversations, work log and settings are fully sourced from Google Sheets.');
