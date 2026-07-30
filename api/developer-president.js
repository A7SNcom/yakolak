const SPREADSHEET_ID='1lpr434PdM-UVhXaNXVtFUcl0oMGWXCRodG5Q6pmoI-c';
const SHEET_NAME='إدارة التطوير';
const SHEET_URL=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const CSV_URL=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&range=A:I`;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.end(JSON.stringify(payload));
}

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

function clean(value,max=20_000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max)}
function safeId(value,fallback){const id=clean(value,160).replace(/[^\p{L}\p{N}:_-]+/gu,'-');return id||fallback}
function statusFromArabic(value){
  const status=clean(value,40);
  if(status==='قيد التنفيذ')return'in_progress';
  if(status==='للمراجعة')return'review';
  if(status==='مكتملة')return'done';
  if(status==='محذوفة')return'deleted';
  return'planned';
}
function attachmentFromUrl(url){
  if(!url)return[];
  if(/\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url))return[{name:'صورة',type:'image',data:url}];
  return[];
}

function buildPayload(rows){
  const tasks=[],taskStates=[],taskComments=[],taskWork=[],contentStates=[];
  const dataRows=rows.slice(1);
  dataRows.forEach((columns,index)=>{
    const [rawId,rawType,rawTitle,rawDetails,rawStatus,rawParent,rawAuthor,rawLink,rawUpdatedAt]=columns;
    const type=clean(rawType,40),title=clean(rawTitle,240),details=clean(rawDetails),parent=clean(rawParent,160),author=clean(rawAuthor,80),link=clean(rawLink,1200),updatedAt=clean(rawUpdatedAt,80)||new Date(0).toISOString();
    if(!type&&!title&&!details)return;
    const id=safeId(rawId,`sheet-row-${index+2}`),status=statusFromArabic(rawStatus);
    if(type==='مهمة'){
      const deleted=status==='deleted';
      taskStates.push({taskId:id,status:deleted?'planned':status,position:index,deleted,updatedAt});
      if(deleted)return;
      tasks.push({id,parentType:'none',parentId:parent||'root-task-list',title:title||'مهمة بلا عنوان',description:details,attachments:attachmentFromUrl(link),createdBy:author||'Google Sheets',owner:author,link,updatedAt,status});
      return;
    }
    if(type==='رد'){
      taskComments.push({id,taskId:parent,authorRole:author.includes('راشد')?'manager':'president',authorName:author||'أحمد',body:details||title,attachments:attachmentFromUrl(link),updatedAt});
      return;
    }
    if(type==='تحديث'){
      taskWork.push({id,taskId:parent,authorRole:author.includes('راشد')?'manager':'worker',authorName:author||'الفريق',entryType:'update',body:details||title,attachments:attachmentFromUrl(link),updatedAt});
      return;
    }
    if(type==='محتوى')contentStates.push({itemId:parent||id,deleted:status==='deleted',updatedAt});
  });
  return{ok:true,database:'google-sheets',sheetName:SHEET_NAME,sheetUrl:SHEET_URL,writableInInterface:false,tasks,taskStates,taskComments,taskWork,contentStates,messages:[]};
}

async function readSheet(){
  const response=await fetch(`${CSV_URL}&_=${Date.now()}`,{headers:{accept:'text/csv'}});
  if(!response.ok)throw new Error(`google_sheet_${response.status}`);
  const source=await response.text();
  if(!source.trim())return buildPayload([[]]);
  return buildPayload(parseCsv(source));
}

export default async function handler(req,res){
  if(req.method==='GET'){
    try{return json(res,200,await readSheet())}
    catch(error){console.error('[Yakolak Google Sheet]',error);return json(res,502,{ok:false,error:'تعذر قراءة قاعدة بيانات Google Sheets',sheetUrl:SHEET_URL})}
  }
  if(req.method==='POST'||req.method==='PUT'||req.method==='PATCH'||req.method==='DELETE')return json(res,405,{ok:false,error:'التعديل يتم مباشرة من قاعدة بيانات Google Sheets',sheetUrl:SHEET_URL});
  res.setHeader('allow','GET');return json(res,405,{ok:false,error:'method_not_allowed',sheetUrl:SHEET_URL});
}