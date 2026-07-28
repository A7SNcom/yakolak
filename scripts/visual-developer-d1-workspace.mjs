import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE_URL=process.env.D1_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d1');
fs.mkdirSync(output,{recursive:true});
const failures=[],results=[];

const drawflowStub=`
window.Drawflow=class Drawflow{
  constructor(container){this.container=container;this.events={};this.nodeId=1;this.drawflow={drawflow:{Home:{data:{}}}};this.zoom=1;}
  start(){this.container.classList.add('parent-drawflow');this.precanvas=document.createElement('div');this.precanvas.className='drawflow';this.container.append(this.precanvas);this.renderAll();}
  on(name,cb){(this.events[name]||=[]).push(cb)}
  emit(name,payload){(this.events[name]||[]).forEach(cb=>cb(payload))}
  renderNode(node){const el=document.createElement('div');el.id='node-'+node.id;el.className='drawflow-node '+(node.class||'');el.style.position='absolute';el.style.left=node.pos_x+'px';el.style.top=node.pos_y+'px';const inputs=document.createElement('div');inputs.className='inputs';for(const key of Object.keys(node.inputs||{})){const p=document.createElement('div');p.className='input '+key;inputs.append(p)}const outputs=document.createElement('div');outputs.className='outputs';for(const key of Object.keys(node.outputs||{})){const p=document.createElement('div');p.className='output '+key;outputs.append(p)}const content=document.createElement('div');content.className='drawflow_content_node';content.innerHTML=node.html||'';el.append(inputs,content,outputs);this.precanvas.append(el)}
  renderAll(){if(!this.precanvas)return;this.precanvas.innerHTML='';Object.values(this.drawflow.drawflow.Home.data).forEach(node=>this.renderNode(node))}
  addNode(name,inputCount,outputCount,x,y,cls,data,html){const id=String(this.nodeId++),inputs={},outputs={};for(let i=1;i<=inputCount;i++)inputs['input_'+i]={connections:[]};for(let i=1;i<=outputCount;i++)outputs['output_'+i]={connections:[]};const node={id:Number(id),name,data:{...data},class:cls,html,inputs,outputs,pos_x:x,pos_y:y};this.drawflow.drawflow.Home.data[id]=node;this.renderNode(node);this.emit('nodeCreated',id);return Number(id)}
  addConnection(outId,inId,outClass,inClass){const out=this.drawflow.drawflow.Home.data[String(outId)],input=this.drawflow.drawflow.Home.data[String(inId)];if(!out||!input)return;out.outputs[outClass].connections.push({node:String(inId),output:inClass});input.inputs[inClass].connections.push({node:String(outId),input:outClass});this.emit('connectionCreated',{output_id:String(outId),input_id:String(inId),output_class:outClass,input_class:inClass})}
  export(){return structuredClone(this.drawflow)}
  import(data){this.drawflow=structuredClone(data);const ids=Object.keys(this.drawflow.drawflow.Home.data).map(Number);this.nodeId=(ids.length?Math.max(...ids):0)+1;this.renderAll();this.emit('import','import')}
  zoom_in(){this.zoom+=.1;this.emit('zoom',this.zoom)}zoom_out(){this.zoom-=.1;this.emit('zoom',this.zoom)}zoom_reset(){this.zoom=1;this.emit('zoom',this.zoom)}
};`;

async function mock(context){
  const workspace={board:null,requests:[],version:0};
  await context.route('**/api/developer-d1',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,entities:[],threads:[]})}));
  await context.route('**/api/developer-d1-workspace',async route=>{
    const request=route.request();
    if(request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,board:workspace.board,boardVersion:workspace.version,boardUpdatedAt:'',requests:workspace.requests})});
    const body=request.postDataJSON();
    if(body.action==='request_create'){
      const created={id:workspace.requests.length+1,kind:body.kind,title:body.title,description:body.description||'',scenario:body.scenario||'',status:'requested',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      workspace.requests.unshift(created);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request:created})});
    }
    if(body.action==='request_status'){
      const item=workspace.requests.find(request=>request.id===body.requestId);if(item)item.status=body.status;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request:item})});
    }
    if(body.action==='board_save'){
      workspace.board=body.board;workspace.version++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,workspace:{board:workspace.board,version:workspace.version,updatedAt:new Date().toISOString()}})});
    }
    return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false}'});
  });
  await context.route('**/drawflow.min.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:drawflowStub}));
  await context.route('**/drawflow.min.css',route=>route.fulfill({status:200,contentType:'text/css',body:'.parent-drawflow{overflow:hidden}.drawflow{position:relative;width:3000px;height:2000px}.drawflow-node{background:#fff}'}));
  await context.route('**/developer-scene.html*',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><body data-scene-ready="true"><script>parent.postMessage({type:'yakolak-developer-scene-ready'},'*')</script></body>`}));
  return workspace;
}

async function run(browser,label,options){
  const context=await browser.newContext(options),workspace=await mock(context),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error?.stack||error)));
  await page.goto(`${BASE_URL}/developer.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>{localStorage.removeItem('yakolak:developer-d1:workspace:v1');localStorage.removeItem('yakolak:developer-d1:review-threads:v2')});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.developerWorkspaceReady==='true'&&document.body.dataset.developerSharedReady==='true');
  if(await page.locator('#devWorkspaceToolbar').count()!==1)throw new Error(`${label}: workspace toolbar missing`);
  if(await page.getByRole('button',{name:'طلب مشهد جديد'}).count()!==1)throw new Error(`${label}: scene request missing`);
  await page.waitForFunction(()=>document.querySelectorAll('.scene-replay').length===6);
  await page.getByRole('button',{name:'طلب مشهد جديد'}).click();
  await page.locator('#d1wName').fill(`مشهد تجريبي ${label}`);
  await page.locator('#d1wDescription').fill('مشهد مطلوب جديد محفوظ في قائمة الطلبات.');
  await page.locator('#d1wScenarioText').fill('بعد جدار الشعارات وقبل الطاولة.');
  await page.locator('#d1wSubmit').click();
  await page.locator('#d1wBoardOverlay.open').waitFor();
  await page.waitForFunction(()=>document.body.dataset.developerWhiteboard==='drawflow');
  await page.waitForFunction(()=>document.querySelectorAll('#d1wCanvas .drawflow-node').length===7);
  await page.getByRole('button',{name:'＋ سيناريو'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#d1wCanvas .drawflow-node').length===8);
  await page.evaluate(()=>{const editor=globalThis.__yakolakD1Workspace.editor;const ids=Object.keys(editor.export().drawflow.Home.data);editor.addConnection(ids[0],ids[1],'output_1','input_1')});
  await page.locator('#d1wSave').click();
  await page.waitForFunction(()=>document.getElementById('d1wStatus')?.textContent==='تم حفظ المخطط المشترك');
  await page.screenshot({path:path.join(output,`${label}-workspace-whiteboard.png`),fullPage:true});
  if(!workspace.board)throw new Error(`${label}: board was not saved`);
  const savedData=workspace.board.drawflow.Home.data;
  if(Object.keys(savedData).length!==8)throw new Error(`${label}: expected eight whiteboard nodes`);
  const connectionCount=Object.values(savedData).reduce((sum,node)=>sum+Object.values(node.outputs||{}).reduce((n,output)=>n+(output.connections?.length||0),0),0);
  if(connectionCount!==1)throw new Error(`${label}: scene connection missing`);
  await page.locator('#d1wBoardClose').click();
  await page.getByRole('button',{name:'معاينة اللعبة المنشورة'}).click();
  await page.locator('#d1wGameOverlay.open').waitFor();
  const publishedSrc=await page.locator('#d1wGameFrame').getAttribute('src');
  if(!publishedSrc||publishedSrc.includes('developer.html'))throw new Error(`${label}: published preview points to developer page`);
  await page.screenshot({path:path.join(output,`${label}-published-game-preview.png`),fullPage:true});
  await page.locator('#d1wGameClose').click();
  const firstReplay=page.locator('.scene-replay').first();await firstReplay.click();
  if(!await firstReplay.locator('xpath=ancestor::article').getAttribute('data-replayed-at'))throw new Error(`${label}: scene replay did not run`);
  await page.getByRole('button',{name:/الطلبات/}).click();
  await page.locator('#d1wModal.open').waitFor();
  if(!String(await page.locator('#d1wList').textContent()).includes(`مشهد تجريبي ${label}`))throw new Error(`${label}: request not listed`);
  if(errors.length)throw new Error(`${label}: page errors\n${errors.join('\n')}`);
  await context.close();
  return{label,requestCreated:true,whiteboardNodes:8,connections:1,replay:true,publishedPreview:true};
}

const browser=await chromium.launch({headless:true});
try{
  try{results.push(await run(browser,'desktop',{viewport:{width:1440,height:900},deviceScaleFactor:1}))}catch(error){failures.push({scope:'desktop',error:String(error?.stack||error)})}
  try{results.push(await run(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}))}catch(error){failures.push({scope:'mobile',error:String(error?.stack||error)})}
}finally{await browser.close()}
fs.writeFileSync(path.join(output,'workspace-report.json'),JSON.stringify({build:'D1-workspace',results,failures},null,2));
if(failures.length)throw new Error(`Developer D1 workspace visual failures: ${JSON.stringify(failures)}`);
console.log('Developer D1 new-scene/new-element requests, visual whiteboard, replay, and published-game preview passed');
