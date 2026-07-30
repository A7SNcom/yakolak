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

requireTokens(html,[
  'id="searchInput"','id="filters"','id="contentGrid"','id="contentModal"','id="databaseLink"','id="refreshButton"',
  'id="previewItemSelect"','id="previewVersionSelect"','فتح قاعدة البيانات','Google Sheets'
],'Google Sheet workspace');
for(const stale of ['id="editorModal"','id="openGlobalTask"','sortablejs','president-kanban','d4PreviewFrame'])if(html.includes(stale))fail(`stale interface remains: ${stale}`);

requireTokens(css,['.workspace-title','.database-actions','.database-link','.content-card','.task-row','.status-in_progress','.preview-loading','.preview-frame.ready','@media(max-width:760px)','[hidden]{display:none!important}'],'workspace styles');
requireTokens(ui,[
  "const API_URL='./api/developer-president'","const SHEET_URL='https://docs.google.com/spreadsheets/d/1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c/edit'",
  'function fuzzyScore(query,value)','function previewSourcesFor(item)','contractFor(','previewItemSelect','previewVersionSelect','payload.tasks','payload.sheetUrl','Google Sheets'
],'Google Sheet interface');

requireTokens(api,[
  "const SPREADSHEET_ID='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c'","const SHEET_NAME='إدارة التطوير'",'gviz/tq?tqx=out:csv',
  'function parseCsv(source)','function buildPayload(rows)',"database:'google-sheets'",'writableInInterface:false','التعديل يتم مباشرة من قاعدة بيانات Google Sheets'
],'Google Sheet API');
for(const stale of ['@tursodatabase','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','CREATE TABLE','yakolak_development_tasks'])if(api.includes(stale))fail(`legacy database remains: ${stale}`);
if(packageJson.dependencies?.['@tursodatabase/serverless'])fail('Turso dependency remains');

if(manifest.version!==7)fail('manifest version mismatch');
if(manifest.database?.provider!=='google-sheets'||manifest.database?.spreadsheetId!=='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c'||manifest.database?.sheetName!=='إدارة التطوير')fail('Google Sheet manifest mismatch');
if(manifest.database?.editing!=='direct-in-google-sheets')fail('database editing mode mismatch');

console.log('Google Sheets is the only development-management database and the simplified Arabic workspace is verified.');