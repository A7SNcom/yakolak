import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});
const failures=[];
const results=[];
const now=()=>new Date().toISOString();

const drawflowStub=`window.Drawflow=class{
  constructor(container){this.container=container;this.events={};this.nodeId=1;this.drawflow={drawflow:{Home:{data:{}}}};this.zoom=1}
  start(){this.precanvas=document.createElement('div');this.precanvas.className='drawflow';this.container.append(this.precanvas);this.render()}
  on(name,callback){(this.events[name]||=[]).push(callback)}
  emit(name,payload){(this.events[name]||[]).forEach(callback=>callback(payload))}
  render(){
    if(!this.precanvas)return;
    this.precanvas.innerHTML='';
    Object.values(this.drawflow.drawflow.Home.data).forEach(node=>{
      const element=document.createElement('div');
      element.id='node-'+node.id;
      element.className='drawflow-node '+(node.class||'');
      element.style.position='absolute';
      element.style.left=(node.pos_x||0)+'px';
      element.style.top=(node.pos_y||0)+'px';
      element.innerHTML='<div class="inputs"><div class="input input_1"></div></div><div class="drawflow_content_node">'+node.html+'</div><div class="outputs"><div class="output output_1"></div></div>';
      this.precanvas.append(element);
    });
  }
  addNode(name,inputCount,outputCount,x,y,className,data,html){
    const id=String(this.nodeId++);
    this.drawflow.drawflow.Home.data[id]={id:Number(id),name,class:className,data,html,pos_x:x,pos_y:y,inputs:{input_1:{connections:[]}},outputs:{output_1:{connections:[]}}};
    this.render();this.emit('nodeCreated',id);return Number(id);
  }
  addConnection(from,to){
    this.drawflow.drawflow.Home.data[String(from)].outputs.output_1.connections.push({node:String(to),output:'input_1'});
    this.drawflow.drawflow.Home.data[String(to)].inputs.input_1.connections.push({node:String(from),input:'output_1'});
    this.emit('connectionCreated',{});
  }
  updateNodeDataFromId(id,data){const node=this.drawflow.drawflow.Home.data[String(id)];if(node){node.data=structuredClone(data);this.emit('nodeDataChanged',id)}}
  removeNodeId(value){const id=String(value).replace('node-','');delete this.drawflow.drawflow.Home.data[id];this.render();this.emit('nodeRemoved',id)}
  export(){return structuredClone(this.drawflow)}
  import(data){this.drawflow=structuredClone(data);this.nodeId=Math.max(0,...Object.keys(this.drawflow.drawflow.Home.data).map(Number))+1;this.render()}
  zoom_in(){this.zoom+=.1;this.emit('zoom',this.zoom)}
  zoom_out(){this.zoom-=.1;this.emit('zoom',this.zoom)}
  zoom_reset(){this.zoom=1;this.emit('zoom',this.zoom)}
}`;

async function mock(context){
  const store={board:null,requests:[],threads:[],comparisons:[]};
  await context.route('**/api/developer-d1',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entities:[],threads:store.threads})}));
  await context.route('**/api/developer-d1-comparisons',async route=>{
    const request=route.request();
    if(request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,comparisons:store.comparisons})});
    const body=request.postDataJSON();
    const comparison={itemKey:body.itemKey,itemKind:body.itemKind,beforeUrl:body.beforeUrl||'',afterUrl:body.afterUrl||'',updatedAt:now()};
    store.comparisons=store.comparisons.filter(item=>item.itemKey!==comparison.itemKey);
    store.comparisons.unshift(comparison);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,comparison})});
  });
  await context.route('**/api/developer-d1-workspace',async route=>{
    const request=route.request();
    if(request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,board:store.board,requests:store.requests})});
    const body=request.postDataJSON();
    if(body.action==='request_create'){
      const item={id:store.requests.length+1,kind:body.kind,title:body.title,description:body.description||'',scenario:body.scenario||'',status:'requested',createdAt:now(),updatedAt:now(),comments:[]};
      store.requests.unshift(item);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request:item})});
    }
    if(body.action==='board_save'){
      store.board=body.board;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,workspace:{board:store.board,version:1,updatedAt:now()}})});
    }
    if(body.action==='request_status'){
      const item=store.requests.find(entry=>entry.id===body.requestId);item.status=body.status;item.updatedAt=now();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request:item})});
    }
    if(body.action==='request_comment'){
      const item=store.requests.find(entry=>entry.id===body.requestId);item.comments.push({id:body.commentId,authorRole:body.authorRole,body:body.body,createdAt:now()});item.updatedAt=now();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request:item})});
    }
    return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false}'});
  });
  await context.route('**/drawflow.min.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:drawflowStub}));
  await context.route('**/drawflow.min.css',route=>route.fulfill({status:200,contentType:'text/css',body:'.drawflow{position:relative;width:3000px;height:2000px}.drawflow-node{position:absolute}'}));
  await context.route('**/developer-scene.html*',route=>route.fulfill({status:200,contentType:'text/html',body:'<body data-scene-ready="true"><script>parent.postMessage({type:"yakolak-developer-scene-ready"},"*")</script></body>'}));
  return store;
}

async function waitForDeveloper(page){
  await page.waitForFunction(()=>document.body.dataset.developerWorkspaceReady==='true'&&document.body.dataset.developerBoardV2==='ready');
}

async function run(browser,label,options){
  const context=await browser.newContext(options);
  const store=await mock(context);
  const page=await context.newPage();
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded'});
  await waitForDeveloper(page);

  await page.getByRole('button',{name:'طلب مشهد جديد'}).click();
  await page.locator('#d1RequestName').fill(`مشهد جديد ${label}`);
  await page.locator('#d1RequestDescription').fill('طلب محفوظ دون فتح المخطط');
  await page.locator('#d1RequestSubmit').click();
  await page.locator('#d1RequestModal').waitFor({state:'hidden'});
  if(await page.locator('#d1BoardOverlay.open').count())throw new Error(`${label}: request still opens board automatically`);
  if(store.requests.length!==1)throw new Error(`${label}: request missing`);

  await page.getByRole('button',{name:/مركز المراجعات/}).click();
  await page.getByRole('button',{name:'الطلبات'}).click();
  const requestCard=page.locator('[data-review-request]').first();
  await requestCard.waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#d1ReviewList .review-compare').length>0);
  if(await requestCard.locator('.compare-pane').count()!==2)throw new Error(`${label}: before-after panes missing`);
  await requestCard.locator('textarea').fill('تمت مراجعة الطلب');
  await requestCard.getByRole('button',{name:'رد المطور'}).click();
  await requestCard.getByRole('button',{name:'تمت إضافته'}).click();
  if(store.requests[0].status!=='implemented')throw new Error(`${label}: request not implemented`);
  await page.locator('#d1ReviewClose').click();
  await waitForDeveloper(page);

  await page.getByRole('button',{name:'مخطط المشاهد'}).click();
  await page.waitForFunction(()=>document.body.dataset.developerWhiteboard==='drawflow'&&document.getElementById('d1BoardShell'));
  if(await page.locator('#d1Canvas .drawflow-node').count()!==8)throw new Error(`${label}: expected eight published scene nodes`);
  for(const selector of ['#d1BoardLibrary','#d1BoardInspector','#d1BoardMinimap'])if(!await page.locator(selector).count())throw new Error(`${label}: missing ${selector}`);

  await page.locator('#d1AddNoteTop').click();
  await page.waitForFunction(()=>document.querySelectorAll('#d1Canvas .drawflow-node').length===9);
  await page.locator('#d1InspectorTitle').fill('ملاحظة اختبار');
  await page.locator('#d1InspectorNote').fill('هذه ملاحظة محفوظة داخل العقدة وتظهر بوضوح في لوحة الخصائص.');
  await page.locator('#d1InspectorForm').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('.drawflow-node.selected')?.textContent?.includes('ملاحظة اختبار'));

  await page.evaluate(()=>{const editor=globalThis.__yakolakD1Workspace.editor,ids=Object.keys(editor.export().drawflow.Home.data);editor.addConnection(ids[0],ids[1])});
  await page.locator('#d1Save').click();
  await page.waitForFunction(()=>document.getElementById('d1BoardStatus')?.textContent==='تم حفظ المخطط المشترك');
  if(!store.board)throw new Error(`${label}: board not saved`);
  const savedNodes=Object.values(store.board.drawflow.Home.data);
  if(savedNodes.length!==9||!savedNodes.some(node=>node.data?.title==='ملاحظة اختبار'&&node.data?.note?.includes('ملاحظة محفوظة')))throw new Error(`${label}: custom node note not persisted`);

  await page.screenshot({path:path.join(output,`${label}-workspace-review-board-v2.png`),fullPage:true});
  await page.locator('#d1BoardClose').click();
  await page.getByRole('button',{name:'معاينة اللعبة المنشورة'}).click();
  const src=await page.locator('#d1GameFrame').getAttribute('src');
  if(!src||src.includes('developer.html'))throw new Error(`${label}: wrong published preview`);
  await context.close();
  return{label,noAutoBoard:true,requests:true,nodes:9,customNodeNotes:true,beforeAfter:true,publishedPreview:true};
}

const browser=await chromium.launch({headless:true});
try{
  for(const [label,options] of [['desktop',{viewport:{width:1440,height:900}}],['mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]]){
    try{results.push(await run(browser,label,options))}catch(error){failures.push({scope:label,error:String(error.stack||error)})}
  }
}finally{await browser.close()}
fs.writeFileSync(path.join(output,'workspace-report.json'),JSON.stringify({build:'D1-board-v2',results,failures},null,2));
if(failures.length)throw new Error(JSON.stringify(failures));
console.log('D1 requests, before-after, clear board v2, custom node notes and published preview passed');
