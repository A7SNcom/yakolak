import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const BASE=process.env.D3_URL||'http://127.0.0.1:4173';
const output=path.resolve('artifacts/developer-d3');
fs.mkdirSync(output,{recursive:true});
const now=()=>new Date().toISOString();
const seedThread=()=>({id:'thread:ready-demo',entityType:'scene',entityId:'clean-entry',status:'ready_for_review',title:'استمرارية حركة الكاميرا',createdAt:now(),updatedAt:now(),comments:[{id:'comment:seed-review',threadId:'thread:ready-demo',authorRole:'reviewer',kind:'comment',body:'المشهد يتوقف فوق الطاولة ويشتت المستخدم.',createdAt:now()},{id:'comment:seed-dev',threadId:'thread:ready-demo',authorRole:'developer',kind:'implementation',body:'تم توحيد المسار وأصبح جاهزًا للمراجعة.',createdAt:now()}]});

async function mock(context){
  const store={threads:[seedThread()],requests:[],comparisons:[],board:null,events:[]};
  const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  await context.route('**/api/developer-d1',async route=>{
    const request=route.request();
    if(request.method()==='GET')return json(route,{ok:true,entities:[],threads:store.threads});
    const body=request.postDataJSON();store.events.push(body);
    if(body.action==='create_thread'){
      const thread={id:body.threadId,entityType:body.entityType,entityId:body.entityId,status:'open',title:body.title||body.body.split('\n')[0],createdAt:now(),updatedAt:now(),comments:[{id:body.commentId,threadId:body.threadId,authorRole:body.authorRole||'reviewer',kind:'comment',body:body.body,createdAt:now()}]};store.threads.unshift(thread);return json(route,{ok:true,thread});
    }
    const thread=store.threads.find(item=>item.id===body.threadId);if(!thread)return json(route,{ok:false,error:'thread_not_found'},404);
    if(body.action==='add_comment'){
      thread.comments.push({id:body.commentId,threadId:thread.id,authorRole:body.authorRole,kind:body.kind||'reply',body:body.body,createdAt:now()});
      if(body.authorRole==='reviewer'&&['ready_for_review','approved','rejected'].includes(thread.status))thread.status='needs_changes';
    }else if(body.action==='set_status'){
      thread.status=body.status;if(body.body)thread.comments.push({id:body.commentId,threadId:thread.id,authorRole:body.authorRole,kind:'decision',body:body.body,createdAt:now()});
    }
    thread.updatedAt=now();return json(route,{ok:true,thread});
  });
  await context.route('**/api/developer-d1-workspace',async route=>{
    const request=route.request();if(request.method()==='GET')return json(route,{ok:true,board:store.board,requests:store.requests});
    const body=request.postDataJSON();store.events.push(body);
    if(body.action==='request_create'){
      const item={id:store.requests.length+1,kind:body.kind,title:body.title,description:body.description||'',scenario:body.scenario||'',status:'requested',createdAt:now(),updatedAt:now(),comments:[]};store.requests.unshift(item);return json(route,{ok:true,request:item});
    }
    if(body.action==='board_save'){store.board=body.board;return json(route,{ok:true,workspace:{board:store.board,version:1,updatedAt:now()}})}
    const item=store.requests.find(entry=>entry.id===body.requestId);if(!item)return json(route,{ok:false,error:'request_not_found'},404);
    if(body.action==='request_status')item.status=body.status;else item.comments.push({id:item.comments.length+1,requestId:item.id,authorRole:body.authorRole,body:body.body,createdAt:now()});item.updatedAt=now();return json(route,{ok:true,request:item});
  });
  await context.route('**/api/developer-d1-comparisons',async route=>{
    const request=route.request();if(request.method()==='GET')return json(route,{ok:true,comparisons:store.comparisons});
    const body=request.postDataJSON(),item={itemKey:body.itemKey,itemKind:body.itemKind,beforeUrl:body.beforeUrl||'',afterUrl:body.afterUrl||'',updatedAt:now()};store.comparisons=store.comparisons.filter(value=>value.itemKey!==item.itemKey);store.comparisons.unshift(item);return json(route,{ok:true,comparison:item});
  });
  await context.route('**/developer-scene.html*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="ar" dir="rtl"><style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;font-family:system-ui;background:linear-gradient(145deg,#fafaf8,#ecebe5)}.room{width:70%;height:62%;border:2px solid #aaa;border-radius:18px;display:grid;place-items:center;background:#fff}h1{font-size:clamp(25px,4vw,56px)}</style><body><div class="room"><h1>معاينة المشهد</h1></div><script>parent.postMessage({type:"yakolak-developer-scene-ready"},"*")<\/script></body></html>'}));
  return store;
}

function visibleTargetMetrics(page){return page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('button')].filter(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0});
  return{minimumHeight:Math.min(...buttons.map(node=>node.getBoundingClientRect().height)),count:buttons.length};
})}

async function run(browser,label,options){
  const context=await browser.newContext(options);await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});const store=await mock(context);const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.goto(`${BASE}/developer.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.developerReady==='true');await page.locator('#d3PreviewState.hidden').waitFor({state:'attached',timeout:10000}).catch(()=>{});
  const initial={horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),visibleIframes:await page.locator('iframe:visible').count(),targets:await visibleTargetMetrics(page),focusCardVisible:await page.locator('.d3-focus-card').isVisible(),errors};
  if(initial.horizontalOverflow!==0)throw new Error(`${label}: horizontal overflow ${initial.horizontalOverflow}`);
  if(initial.visibleIframes!==1)throw new Error(`${label}: expected one visible iframe, got ${initial.visibleIframes}`);
  if(initial.targets.minimumHeight<44)throw new Error(`${label}: target smaller than 44px (${initial.targets.minimumHeight})`);
  if(!initial.focusCardVisible)throw new Error(`${label}: primary next actions are not visible`);
  await page.screenshot({path:path.join(output,`${label}-main.png`),fullPage:true});

  const result={label,initial,taskSteps:0,reviewSteps:0,requestSteps:0};
  if(label==='desktop'){
    result.taskSteps++;await page.getByRole('button',{name:'اطلب تعديلًا'}).click();await page.waitForTimeout(260);
    await page.locator('#d3TaskProblem').fill('يتوقف الانتقال فوق الطاولة ويشتت المستخدم.');await page.locator('#d3TaskOutcome').fill('حركة واحدة مستمرة تمر بالطاولة دون توقف.');await page.locator('#d3TaskCriteria').fill('لا توجد قفزة بصرية وتعمل الرحلة على الجوال والكمبيوتر.');
    result.taskSteps++;await page.locator('#d3CopyTask').click();const clipboard=await page.evaluate(()=>navigator.clipboard.readText());if(!clipboard.includes('scene.clean-entry')||!clipboard.includes('معايير القبول')||!clipboard.includes('صورة جوال')||!clipboard.includes('اختبار وظيفي'))throw new Error('desktop: AI execution packet is missing context or evidence');
    await page.screenshot({path:path.join(output,'desktop-task-bridge.png'),fullPage:true});
    result.taskSteps++;await page.locator('#d3SaveTask').click();await page.waitForFunction(()=>document.querySelectorAll('.d3-thread').length>=2);if(store.threads.length!==2)throw new Error('desktop: task was not persisted');if(!store.threads[0].comments[0].body.includes('النتيجة المطلوبة')||!store.threads[0].comments[0].body.includes('الدليل المطلوب'))throw new Error('desktop: structured task body incomplete');
    await page.locator('#d3DrawerClose').click();await page.waitForTimeout(260);

    await page.locator('#d3CompareToggle').click();if(await page.locator('#d3CompareView iframe:visible').count()!==2)throw new Error('desktop: comparison did not expose two panes on demand');await page.screenshot({path:path.join(output,'desktop-before-after.png'),fullPage:true});await page.locator('#d3CompareToggle').click();

    result.reviewSteps++;await page.locator('#d3ReviewOpen').click();await page.waitForTimeout(260);const ready=page.locator('[data-thread-id="thread:ready-demo"]');if(!await ready.isVisible())throw new Error('desktop: ready review not visible');result.reviewSteps++;await ready.getByRole('button',{name:'اعتماد النتيجة'}).click();if(store.threads.find(item=>item.id==='thread:ready-demo')?.status!=='approved')throw new Error('desktop: approval did not persist');
    await page.locator('#d3DrawerClose').click();await page.waitForTimeout(260);

    result.requestSteps++;await page.locator('#d3NewRequest').click();await page.locator('#d3RequestName').fill('مشهد شاشة النتائج');await page.locator('#d3RequestDescription').fill('يعرض نتيجة الجولة وخيار بدء جولة جديدة.');await page.locator('#d3RequestScenario').fill('بعد اكتمال الجولة مباشرة.');result.requestSteps++;await page.getByRole('button',{name:'حفظ الطلب وفتحه للمراجعة'}).click();if(store.requests.length!==1)throw new Error('desktop: new request missing');if(await page.locator('#d3SelectionCode').textContent()!=='request:1')throw new Error('desktop: request context not opened after save');
    await page.screenshot({path:path.join(output,'desktop-request-review.png'),fullPage:true});
    await page.locator('#d3DrawerClose').click();await page.waitForTimeout(260);await page.keyboard.press('Control+K');if(!await page.locator('#d3Search').evaluate(node=>node===document.activeElement))throw new Error('desktop: Ctrl+K did not focus search');
  }else{
    await page.getByRole('button',{name:'العمل'}).click();await page.waitForTimeout(260);const drawer=await page.locator('#d3Drawer').boundingBox();if(!drawer||drawer.x!==0||drawer.width<389||drawer.y>59)throw new Error(`mobile: work drawer is not full and stable ${JSON.stringify(drawer)}`);await page.screenshot({path:path.join(output,'mobile-work.png'),fullPage:true});
    await page.locator('#d3DrawerClose').click();await page.waitForTimeout(260);await page.locator('.d3-mobile-nav [data-mobile-view="content"]').click();await page.waitForTimeout(100);if(!await page.locator('#d3Navigator').isVisible())throw new Error('mobile: content screen unavailable');await page.screenshot({path:path.join(output,'mobile-content.png'),fullPage:true});
  }
  await context.close();return result;
}

const browser=await chromium.launch({headless:true});const results=[];const failures=[];
try{for(const [label,options] of [['desktop',{viewport:{width:1440,height:900}}],['mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]]){try{results.push(await run(browser,label,options))}catch(error){failures.push({scope:label,error:String(error.stack||error)})}}}finally{await browser.close()}
fs.writeFileSync(path.join(output,'ux-evidence.json'),JSON.stringify({build:'D3-task-workspace',results,failures,criteria:{oneLivePreview:true,noHorizontalOverflow:true,minimumTargetPx:44,structuredAIHandoff:true,desktopTaskStepsMax:3,desktopReviewStepsMax:2}},null,2));
if(failures.length)throw new Error(JSON.stringify(failures,null,2));
console.log('Developer D3 task, review, AI bridge, comparison, requests, desktop and mobile UX passed.');
