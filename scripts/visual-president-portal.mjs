import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const base=process.env.PRESIDENT_BASE_URL||'http://127.0.0.1:4174';
const artifacts=path.resolve('artifacts/president-portal');
const ledger=JSON.parse(fs.readFileSync('ops/ai-team/development-ledger.json','utf8'));
fs.mkdirSync(artifacts,{recursive:true});

function respond(route,payload){return route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(payload)})}
function createStore(){
  return{
    tasks:[{id:'task-custom-journey',parentType:'journey',parentId:'journey-1',title:'مراجعة رحلة الدخول',description:'افحص الانتقال بين المشاهد.',attachments:[],createdBy:'manager',createdAt:'2026-07-29T14:00:00Z',updatedAt:'2026-07-29T14:00:00Z'}],
    taskStates:[{taskId:'YAK-009-01',status:'in_progress',position:0,deleted:false,updatedAt:'2026-07-29T14:00:00Z'},{taskId:'task-custom-journey',status:'planned',position:1,deleted:false,updatedAt:'2026-07-29T14:00:00Z'}],
    contentStates:[],taskComments:[{id:'comment-rashed-1',taskId:'task-custom-journey',authorRole:'manager',body:'المعاينة جاهزة لملاحظتك.',attachments:[],createdAt:'2026-07-29T14:10:00Z'}],
    taskWork:[
      {id:'work-1',taskId:'task-custom-journey',authorRole:'manager',authorName:'Rashed',entryType:'delegation',body:'يا نور، افحص بداية الرحلة وأرسل النتيجة بصورة واضحة.',attachments:[],createdAt:'2026-07-29T14:20:00Z'},
      {id:'work-2',taskId:'task-custom-journey',authorRole:'worker',authorName:'Noor',entryType:'update',body:'راجعت البداية، والانتقال الأول يحتاج تعديلًا بسيطًا.',attachments:[],createdAt:'2026-07-29T14:30:00Z'}
    ],messages:[],reorderCalls:0
  };
}
function upsert(items,key,value){const index=items.findIndex(item=>item[key]===value[key]);if(index>=0)items[index]=value;else items.push(value)}
async function mock(page,store){
  await page.route('**/ops/ai-team/development-ledger.json',route=>respond(route,ledger));
  await page.route('**/developer-scene.html*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ar" dir="rtl"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#17201e;color:#fff;font:700 26px Tahoma}</style><body>معاينة</body></html>'}));
  await page.route('**/api/developer-president',async route=>{
    const request=route.request();
    if(request.method()==='GET')return respond(route,{ok:true,channelVersion:2,directives:[],decisions:[],...store});
    const body=request.postDataJSON(),now=new Date().toISOString();
    if(body.action==='task_create'){
      const task={id:body.id,parentType:body.parentType,parentId:body.parentId,title:body.title,description:body.description||'',attachments:body.attachments||[],createdBy:'president',createdAt:now,updatedAt:now};store.tasks.push(task);store.taskStates.push({taskId:task.id,status:'planned',position:store.taskStates.length+20,deleted:false,updatedAt:now});return respond(route,{ok:true,task});
    }
    if(body.action==='task_status'){
      if(body.status==='in_progress')store.taskStates=store.taskStates.map(entry=>entry.status==='in_progress'&&entry.taskId!==body.taskId?{...entry,status:'planned'}:entry);
      const taskState={...(store.taskStates.find(entry=>entry.taskId===body.taskId)||{taskId:body.taskId,position:0,deleted:false}),status:body.status,updatedAt:now};upsert(store.taskStates,'taskId',taskState);return respond(route,{ok:true,taskState});
    }
    if(body.action==='task_reorder'){store.reorderCalls+=1;body.taskIds.forEach((taskId,position)=>upsert(store.taskStates,'taskId',{...(store.taskStates.find(entry=>entry.taskId===taskId)||{taskId,status:'planned',deleted:false}),position,updatedAt:now}));return respond(route,{ok:true,taskIds:body.taskIds})}
    if(body.action==='task_delete'){const taskState={...(store.taskStates.find(entry=>entry.taskId===body.taskId)||{taskId:body.taskId,status:'planned',position:0}),deleted:true,updatedAt:now};upsert(store.taskStates,'taskId',taskState);return respond(route,{ok:true,taskState})}
    if(body.action==='content_delete'){const contentState={itemId:body.itemId,deleted:true,updatedAt:now};upsert(store.contentStates,'itemId',contentState);return respond(route,{ok:true,contentState})}
    if(body.action==='task_comment'){const comment={id:body.id,taskId:body.taskId,authorRole:'president',body:body.body||'',attachments:body.attachments||[],createdAt:now};store.taskComments.push(comment);return respond(route,{ok:true,comment})}
    return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false}'});
  });
}

async function verify(viewport,name){
  const browser=await chromium.launch({headless:true});
  try{
    const store=createStore(),page=await browser.newPage({viewport});
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));await mock(page,store);
    await page.goto(`${base}/developer.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.developerReady==='true');
    if(await page.locator('.brand,.card-cover,.media-arrow').count())throw new Error(`${name}: decorative or stale preview UI remains`);
    if(await page.locator('#filters [data-filter]').count()!==5)throw new Error(`${name}: filters are incomplete`);

    await page.locator('#searchInput').fill('رحله دخوول');
    await page.locator('.content-card').first().getByText('رحلة الدخول',{exact:true}).waitFor();
    await page.locator('#searchInput').fill('');

    await page.locator('[data-item-id="journey:journey-1"]').click();
    await page.locator('#contentModal[open]').waitFor();
    if(await page.locator('#previewItemSelect option').count()<2)throw new Error(`${name}: journey preview selector is missing`);
    if(!(await page.locator('#previewVersionField').isHidden()))throw new Error(`${name}: single version selector should be hidden`);
    await page.getByText('راشد',{exact:true}).waitFor();
    const firstTask=page.locator('#linkedTasks .task-detail').first();
    await firstTask.getByRole('button',{name:'الشغل'}).click();
    await firstTask.getByText('يا نور، افحص بداية الرحلة وأرسل النتيجة بصورة واضحة.',{exact:true}).waitFor();
    await firstTask.getByText('راجعت البداية، والانتقال الأول يحتاج تعديلًا بسيطًا.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,`${name}-task-work.png`),fullPage:true});
    await firstTask.getByRole('button',{name:'أحمد وراشد'}).click();
    const commentForm=page.locator('#linkedTasks .comment-form').first();
    await commentForm.locator('textarea').fill('أعد فحص البداية.');
    await commentForm.locator('input[type="file"]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('yakolak note')});
    await commentForm.locator('button[type="submit"]').click();
    await page.getByText('أعد فحص البداية.',{exact:true}).waitFor();
    await page.getByText('note.txt',{exact:true}).waitFor();

    await page.locator('#linkedTaskForm input[name="title"]').fill('مهمة مرتبطة جديدة');
    await page.locator('#linkedTaskForm button[type="submit"]').click();
    await page.locator('#linkedTasks').getByText('مهمة مرتبطة جديدة',{exact:true}).waitFor();
    await page.locator('#modalClose').click();

    await page.locator('[data-item-id="element:base-small"]').click();
    await page.locator('#previewVersionField:not([hidden])').waitFor();
    if(await page.locator('#previewVersionSelect option').count()<4)throw new Error(`${name}: element versions are incomplete`);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#removeCurrent').click();
    await page.locator('[data-item-id="element:base-small"]').waitFor({state:'detached'});

    await page.locator('#filters [data-filter="task"]').click();
    if(await page.locator('.content-card').count())throw new Error(`${name}: task view still uses cards`);
    if(await page.locator('.task-row').count()<3)throw new Error(`${name}: ordered task rows are missing`);
    if(await page.locator('.task-row .status-in_progress').count()!==1)throw new Error(`${name}: more than one task is in progress`);
    const customRow=page.locator('[data-task-id="task-custom-journey"]');
    await customRow.locator('.status-select').selectOption('in_progress');
    await page.locator('[data-task-id="task-custom-journey"] .status-in_progress').waitFor();await page.waitForTimeout(100);
    if(await page.locator('.task-row .status-in_progress').count()!==1)throw new Error(`${name}: active task exclusivity failed`);

    if(name==='desktop'){
      const handle=page.locator('[data-task-id="task-custom-journey"] .drag-handle'),target=page.locator('.task-row').first();await handle.scrollIntoViewIfNeeded();const from=await handle.boundingBox(),to=await target.boundingBox();
      await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+3,{steps:4});await page.mouse.up();
      await page.waitForTimeout(250);if(store.reorderCalls<1)throw new Error('desktop: task order was not saved');
    }

    page.once('dialog',dialog=>dialog.accept());await customRow.locator('.row-remove').click();
    await page.locator('[data-task-id="task-custom-journey"]').waitFor({state:'detached'});
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`${name}-ordered-tasks.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(overflow>2)throw new Error(`${name}: horizontal overflow ${overflow}px`);
    if(errors.length)throw new Error(`${name}: ${errors.join(' | ')}`);
  }finally{await browser.close()}
}

await verify({width:1440,height:1000},'desktop');
await verify({width:390,height:844},'mobile');
console.log('Task feeds, fuzzy search, dropdown previews, attachments, statuses, reorder, and removal passed desktop/mobile verification.');
