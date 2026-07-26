import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const V120_URL=process.env.V120_URL||'http://127.0.0.1:4173';
const V121_URL=process.env.V121_URL||'http://127.0.0.1:4174';
const ROOMS_URL='https://yakolak.vercel.app/api/rooms-v118';
const CALIBRATION_URL='https://yakolak.vercel.app/api/calibration';
const COLORS=['right','back','left','front'];
const out=new URL('../artifacts/v121-piece-edge-comparison/',import.meta.url);
const file=name=>fileURLToPath(new URL(name,out));
await mkdir(out,{recursive:true});

const browser=await chromium.launch({
  headless:true,
  args:[
    '--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist',
    '--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'
  ]
});

const errors=[];
const consoleErrors=[];
function watch(page,label){
  page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  page.on('console',message=>{
    if(message.type()==='error'&&!message.text().includes('Failed to load resource')){
      consoleErrors.push(`${label}: ${message.text()}`);
    }
  });
}

async function proxyLiveServices(page){
  await page.route('**/api/calibration**',async route=>{
    const response=await page.context().request.get(CALIBRATION_URL,{timeout:30000});
    await route.fulfill({response});
  });
  await page.route('**/api/rooms-v118**',async route=>{
    const request=route.request();
    const headers={...request.headers()};
    delete headers.host;
    delete headers['content-length'];
    const target=new URL(ROOMS_URL);
    target.search=new URL(request.url()).search;
    const response=await page.context().request.fetch(target.toString(),{
      method:request.method(),headers,data:request.postDataBuffer()||undefined,timeout:35000
    });
    await route.fulfill({response});
  });
}

async function waitForClient(page,version){
  await page.waitForFunction(expected=>{
    const versionReady=expected===121
      ? Boolean(globalThis.__yakolakV121&&globalThis.__yakolakMobilePieceClarityV121&&globalThis.__yakolakPieceClarityV121)
      : Boolean(globalThis.__yakolakV120)&&!globalThis.__yakolakV121;
    return document.body.classList.contains('yakolak-ready')&&
      Boolean(globalThis.__yakolakOnlineV114)&&Boolean(globalThis.__yakolakGame?.renderer)&&versionReady;
  },version,{timeout:60000});
}

async function api(page,body,token=null){
  return page.evaluate(async({body,token})=>{
    const response=await fetch('/api/rooms-v118',{
      method:'POST',cache:'no-store',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
      body:JSON.stringify(body)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`${response.status}:${payload.error||'request_failed'}`);
    return payload;
  },{body,token});
}

async function installIdentity(page,identity){
  await page.evaluate(value=>sessionStorage.setItem(`yakolak-online-v117:${value.code}`,JSON.stringify(value)),identity);
}

async function move(page,identity,code,state,zone,size){
  const result=await api(page,{action:'move',code,version:state.version,zone,size},identity.token);
  return result.room;
}

async function prepareOnlineScene(page,baseUrl,version){
  const initial=new URL(baseUrl);
  initial.searchParams.set('clear',`${Date.now()}-${version}`);
  await page.goto(initial.toString(),{waitUntil:'domcontentloaded',timeout:70000});
  await waitForClient(page,version);

  const created=await api(page,{action:'create',color:'right',targetPlayers:4,targetRounds:3});
  const code=created.room.code;
  const back=await api(page,{action:'join',code,color:'back'});
  const left=await api(page,{action:'join',code,color:'left'});
  const front=await api(page,{action:'join',code,color:'front'});
  const identities=[created,back,left,front].map(result=>({code,token:result.token,seat:result.seat}));
  await installIdentity(page,identities[0]);

  const roomUrl=new URL(baseUrl);
  roomUrl.searchParams.set('room',code);
  roomUrl.searchParams.set('clear',`${Date.now()}-${version}-room`);
  await page.goto(roomUrl.toString(),{waitUntil:'domcontentloaded',timeout:70000});
  await waitForClient(page,version);
  await page.waitForFunction(()=>globalThis.__yakolakOnlineV114?.room?.status==='playing',null,{timeout:45000});

  let state=front.room;
  const moves=[
    [0,0,'l'],[1,1,'l'],[2,2,'l'],[3,3,'l'],
    [0,4,'m'],[1,5,'m'],[2,6,'m'],[3,7,'m']
  ];
  for(const [identityIndex,zone,size] of moves){
    state=await move(page,identities[identityIndex],code,state,zone,size);
  }
  assert.equal(state.status,'playing');
  assert.equal(state.moveNumber,8);

  await page.waitForFunction(()=>{
    const room=globalThis.__yakolakOnlineV114?.room;
    const pieces=globalThis.__yakolakGame?.pieces||[];
    return room?.moveNumber>=8&&pieces.filter(piece=>piece.placed).length>=8&&
      new Set(pieces.filter(piece=>piece.placed).map(piece=>piece.dir)).size===4;
  },null,{timeout:50000});

  await page.evaluate(()=>{
    const game=globalThis.__yakolakGame;
    document.querySelector('vercel-live-feedback')?.remove();
    document.getElementById('yakolakGameSetup')?.classList.add('hidden');
    document.getElementById('yakolakTutorialDialog')?.classList.remove('open');
    document.getElementById('yakolakOnlineDialog')?.classList.remove('open');
    if(game.setupGroup)game.setupGroup.visible=false;
    if(game.meshes?.['9'])game.meshes['9'].visible=true;
    game.clearHighlights?.();
    game.setResponsiveOverview?.();
    game.render?.();
  });
  await page.waitForTimeout(700);
  return {code,state};
}

async function capture(page,name){
  const session=await page.context().newCDPSession(page);
  try{
    const image=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    await writeFile(file(name),Buffer.from(image.data,'base64'));
  }finally{await session.detach();}
}

async function measure(page){
  await page.bringToFront();
  return page.evaluate(async expectedColors=>{
    const game=globalThis.__yakolakGame;
    const renderer=game.renderer;
    const gl=renderer.getContext();
    const scene=game.gameGroup.parent;
    const pieces=game.pieces||[];
    const boardMesh=game.meshes['9'];
    const placed=pieces.filter(piece=>piece.placed);
    const round=value=>Number(value.toFixed(4));
    const percentile=(values,ratio)=>{
      const sorted=[...values].sort((a,b)=>a-b);
      if(!sorted.length)return 0;
      return sorted[Math.floor((sorted.length-1)*ratio)];
    };
    const luminance=(r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
    const difference=(first,second,index)=>Math.abs(first[index]-second[index])+Math.abs(first[index+1]-second[index+1])+Math.abs(first[index+2]-second[index+2]);
    const renderPixels=()=>{
      game.render();gl.finish();
      const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels;
    };

    const samples=[];
    for(let i=0;i<10;i+=1){game.render();gl.finish();}
    for(let i=0;i<72;i+=1){
      const started=performance.now();game.render();gl.finish();samples.push(performance.now()-started);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    game.render();gl.finish();
    const buffer=renderer.getDrawingBufferSize(new game.THREE.Vector2());
    let lights=0;scene.traverse(object=>{if(object.isLight)lights+=1;});

    const materials={};
    for(const color of expectedColors){
      const material=pieces.find(piece=>piece.dir===color)?.mesh?.material;
      materials[color]={
        color:material?.color?`#${material.color.getHexString()}`:null,
        roughness:Number(material?.roughness),metalness:Number(material?.metalness),
        emissive:material?.emissive?`#${material.emissive.getHexString()}`:null,
        emissiveIntensity:Number(material?.emissiveIntensity||0)
      };
    }

    const originalVisibility=pieces.map(piece=>piece.mesh.visible);
    pieces.forEach(piece=>{piece.mesh.visible=false;});
    boardMesh.visible=true;
    const boardFrame=renderPixels();
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixelCount=width*height;
    const clarity={};

    for(const color of expectedColors){
      pieces.forEach(piece=>{piece.mesh.visible=Boolean(piece.placed&&piece.dir===color);});
      const frame=renderPixels();
      const mask=new Uint8Array(pixelCount);
      const lums=new Float32Array(pixelCount);
      const pieceLums=[];
      for(let p=0,index=0;p<pixelCount;p+=1,index+=4){
        if(difference(frame,boardFrame,index)>=20){
          mask[p]=1;
          const lum=luminance(frame[index],frame[index+1],frame[index+2]);
          lums[p]=lum;pieceLums.push(lum);
        }
      }
      if(pieceLums.length<100)throw new Error(`insufficient_${color}_piece_pixels:${pieceLums.length}`);
      const edgeContrast=[];
      const surfaceGradient=[];
      for(let y=1;y<height-1;y+=1){
        for(let x=1;x<width-1;x+=1){
          const p=y*width+x;
          if(!mask[p])continue;
          const neighbors=[p-1,p+1,p-width,p+width];
          let boundary=false,maxOutside=0;
          for(const n of neighbors){
            if(!mask[n]){
              boundary=true;
              const ni=n*4;
              const outside=luminance(frame[ni],frame[ni+1],frame[ni+2]);
              maxOutside=Math.max(maxOutside,Math.abs(lums[p]-outside));
            }else{
              surfaceGradient.push(Math.abs(lums[p]-lums[n]));
            }
          }
          if(boundary)edgeContrast.push(maxOutside);
        }
      }
      clarity[color]={
        pixels:pieceLums.length,
        edgePixels:edgeContrast.length,
        edgeContrastMedian:round(percentile(edgeContrast,0.5)),
        edgeContrastP75:round(percentile(edgeContrast,0.75)),
        edgeContrastP90:round(percentile(edgeContrast,0.9)),
        surfaceGradientP75:round(percentile(surfaceGradient,0.75)),
        surfaceGradientP90:round(percentile(surfaceGradient,0.9)),
        highlightRange:round(percentile(pieceLums,0.95)-percentile(pieceLums,0.5))
      };
    }

    pieces.forEach((piece,index)=>{piece.mesh.visible=originalVisibility[index];});
    game.render();gl.finish();

    return {
      pixelRatio:renderer.getPixelRatio(),drawingBuffer:{width:buffer.x,height:buffer.y},
      canvasCss:{width:renderer.domElement.getBoundingClientRect().width,height:renderer.domElement.getBoundingClientRect().height},
      render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lines:renderer.info.render.lines,points:renderer.info.render.points},
      memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length||0},
      lights,shadows:renderer.shadowMap.enabled,antialias:Boolean(gl.getContextAttributes()?.antialias),
      fullFrameMs:{median:round(percentile(samples,0.5)),p95:round(percentile(samples,0.95))},
      materials,clarity,placed:placed.map(piece=>({color:piece.dir,size:piece.type,zone:piece.zoneIndex})),
      board:{color:`#${boardMesh.material.color.getHexString()}`,roughness:boardMesh.material.roughness,metalness:boardMesh.material.metalness}
    };
  },COLORS);
}

async function run(label,version,url,viewport){
  const context=await browser.newContext(viewport);
  try{
    const page=await context.newPage();watch(page,label);await proxyLiveServices(page);
    const room=await prepareOnlineScene(page,url,version);
    await capture(page,`${label}.png`);
    const metrics=await measure(page);
    return {...metrics,roomCode:room.code,moves:room.state.moveNumber};
  }finally{await context.close().catch(()=>{});}
}

function assertStructuralCostEqual(before,after,label){
  for(const key of ['pixelRatio','drawingBuffer','canvasCss','render','memory','lights','shadows','antialias']){
    assert.deepEqual(after[key],before[key],`${label}: ${key} changed`);
  }
}

function assertMaterialIdentityExceptRoughness(before,after,color,label){
  for(const key of ['color','metalness','emissive','emissiveIntensity']){
    assert.deepEqual(after.materials[color][key],before.materials[color][key],`${label}: ${color} ${key} changed`);
  }
}

let succeeded=false;
try{
  const desktop={viewport:{width:1440,height:900},deviceScaleFactor:1};
  const mobile={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
  const v120Desktop=await run('v120-desktop',120,V120_URL,desktop);
  const v121Desktop=await run('v121-desktop',121,V121_URL,desktop);
  const v120Mobile=await run('v120-mobile',120,V120_URL,mobile);
  const v121Mobile=await run('v121-mobile',121,V121_URL,mobile);

  assertStructuralCostEqual(v120Desktop,v121Desktop,'desktop');
  assertStructuralCostEqual(v120Mobile,v121Mobile,'mobile');
  assert.deepEqual(v121Desktop.materials,v120Desktop.materials,'desktop piece materials changed');
  assert.deepEqual(v121Desktop.board,v120Desktop.board,'desktop board changed');
  assert.deepEqual(v121Mobile.board,v120Mobile.board,'mobile board changed');

  const expected={right:0.72,back:0.60,left:0.48,front:0.54};
  for(const color of COLORS){
    assertMaterialIdentityExceptRoughness(v120Mobile,v121Mobile,color,'mobile');
    assert.equal(v121Mobile.materials[color].roughness,expected[color],`mobile: ${color} roughness mismatch`);
  }

  const maxMedianIncrease=Math.max(0.2,v120Mobile.fullFrameMs.median*0.2);
  assert.ok(v121Mobile.fullFrameMs.median<=v120Mobile.fullFrameMs.median+maxMedianIncrease,
    `mobile frame median increased too much: ${v120Mobile.fullFrameMs.median} -> ${v121Mobile.fullFrameMs.median}`);

  const results={
    ok:true,
    source:{v120:'main merge 30da92d2 served locally',v121:'branch head served locally',candidateCommit:process.env.V121_COMMIT||null,roomServer:ROOMS_URL,calibration:CALIBRATION_URL},
    viewports:{desktop:{width:1440,height:900,deviceScaleFactor:1},mobile:{width:390,height:844,deviceScaleFactor:2}},
    v120:{desktop:v120Desktop,mobile:v120Mobile},v121:{desktop:v121Desktop,mobile:v121Mobile},
    comparison:{
      structuralRenderCostIdentical:true,desktopMaterialsIdentical:true,
      desktopMedianDeltaMs:round(v121Desktop.fullFrameMs.median-v120Desktop.fullFrameMs.median),
      mobileMedianDeltaMs:round(v121Mobile.fullFrameMs.median-v120Mobile.fullFrameMs.median),
      mobileClarityGain:Object.fromEntries(COLORS.map(color=>[color,{
        edgeP75Percent:round((v121Mobile.clarity[color].edgeContrastP75/Math.max(v120Mobile.clarity[color].edgeContrastP75,0.0001)-1)*100),
        surfaceP90Percent:round((v121Mobile.clarity[color].surfaceGradientP90/Math.max(v120Mobile.clarity[color].surfaceGradientP90,0.0001)-1)*100),
        highlightRangePercent:round((v121Mobile.clarity[color].highlightRange/Math.max(v120Mobile.clarity[color].highlightRange,0.0001)-1)*100)
      }]))
    },errors,consoleErrors
  };
  await writeFile(new URL('results.json',out),JSON.stringify(results,null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log('v121 deterministic piece edge and render cost comparison passed');
  succeeded=true;
}catch(error){
  await writeFile(new URL('results.json',out),JSON.stringify({ok:false,error:error.stack||String(error),errors,consoleErrors},null,2));
  throw error;
}finally{
  await browser.close().catch(()=>{});
}
if(succeeded)process.exit(0);

function round(value){return Number(Number(value).toFixed(4));}
