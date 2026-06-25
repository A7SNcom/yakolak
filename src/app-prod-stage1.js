import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';

const BUILD='68';
const MODEL_DIR='./assets/models/';
const MARBLE_URL='https://i.ibb.co/B2h2tNKG/Screenshot-2026-06-22-094236.png';
const TABLE_OBJ_URL=`${MODEL_DIR}uploads_files_3139458_Mars+Angled+Stump+Side+Table+30x30x45.obj?v=${BUILD}-table`;
const TABLE_ALBEDO_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Albedo.png?v=${BUILD}-albedo`;
const TABLE_NORMAL_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Normal.png?v=${BUILD}-normal`;
const TABLE_ROUGHNESS_URL=`${MODEL_DIR}Mars%20Angled%20Stump%20Side%20Table%2030x30x45_Roughness.png?v=${BUILD}-roughness`;
const modelPath=n=>`${MODEL_DIR}${n}.stl?v=${BUILD}-${n}`;
const root=document.getElementById('view');
const loaderEl=document.getElementById('yakolakLoader');
const log=(...a)=>console.info('[Yakolak]',...a);
function done(){if(root)root.style.opacity='1';if(loaderEl){loaderEl.classList.add('done');setTimeout(()=>loaderEl.remove(),420)}}
function fail(e){console.error('[Yakolak] prod stage1 error',e);if(loaderEl)loaderEl.classList.add('error')}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xe9eef2);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,12000);
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio||1,1),1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.03;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);

const ROOM_CFG={floorY:-650,topY:1250,halfW:2400,backZ:-2400,frontZ:2400};
const ROOM_LIMIT={minX:-ROOM_CFG.halfW+90,maxX:ROOM_CFG.halfW-90,minY:ROOM_CFG.floorY+80,maxY:ROOM_CFG.topY-70,minZ:ROOM_CFG.backZ+90,maxZ:ROOM_CFG.frontZ-90};
const TABLE_TOP_Y=-16;
const TABLE_CONTACT_EPS=.8;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let controls;
function keepInsideRoom(){
  if(!controls)return;
  camera.position.x=clamp(camera.position.x,ROOM_LIMIT.minX,ROOM_LIMIT.maxX);
  camera.position.y=clamp(camera.position.y,ROOM_LIMIT.minY,ROOM_LIMIT.maxY);
  camera.position.z=clamp(camera.position.z,ROOM_LIMIT.minZ,ROOM_LIMIT.maxZ);
  controls.target.x=clamp(controls.target.x,-560,560);
  controls.target.y=clamp(controls.target.y,ROOM_CFG.floorY+80,ROOM_CFG.topY-170);
  controls.target.z=clamp(controls.target.z,-560,560);
}
function render(){keepInsideRoom();renderer.render(scene,camera)}

controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false;
controls.enablePan=false;
controls.minDistance=180;
controls.maxDistance=1350;
controls.maxPolarAngle=Math.PI*.62;
controls.minPolarAngle=Math.PI*.18;
controls.addEventListener('change',render);

scene.add(new THREE.HemisphereLight(0xffffff,0xd7e0e5,1.22));
const key=new THREE.DirectionalLight(0xffffff,1.46);key.position.set(-450,700,500);scene.add(key);
const rim=new THREE.DirectionalLight(0xffffff,.32);rim.position.set(420,360,-620);scene.add(rim);
const fill=new THREE.PointLight(0xffffff,.55,2600);fill.position.set(480,360,520);scene.add(fill);

function addRoom(){
  const {floorY,topY,halfW,backZ,frontZ}=ROOM_CFG;
  const w=halfW*2,d=frontZ-backZ,h=topY-floorY,my=floorY+h/2;
  const group=new THREE.Group();group.name='yakolak-soft-empty-room';scene.add(group);
  const mat=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:opt.roughness??.94,metalness:0,side:THREE.DoubleSide,transparent:!!opt.transparent,opacity:opt.opacity??1,depthWrite:opt.depthWrite??true});
  const floorMat=mat(0xe6ecef,{roughness:.9});
  const ceilMat=mat(0xffffff,{roughness:.96});
  const wallMat=mat(0xfafcfd,{roughness:.94});
  const sideMat=mat(0xf5f8fa,{roughness:.94});
  const frontMat=mat(0xffffff,{transparent:true,opacity:.10,depthWrite:false});
  const trimMat=mat(0xd2dbe1,{roughness:.9});
  const edgeMat=new THREE.LineBasicMaterial({color:0x9eacb5,transparent:true,opacity:.84});
  const gridMat=new THREE.LineBasicMaterial({color:0xc9d3da,transparent:true,opacity:.30});
  const panel=(name,W,H,x,y,z,rx,ry,rz,m)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(W,H),m);p.name=name;p.position.set(x,y,z);p.rotation.set(rx,ry,rz);p.receiveShadow=false;p.renderOrder=-1000;group.add(p);return p};
  panel('room-floor',w,d,0,floorY,0,-Math.PI/2,0,0,floorMat);
  panel('room-ceiling',w,d,0,topY,0,Math.PI/2,0,0,ceilMat);
  panel('room-back-wall',w,h,0,my,backZ,0,0,0,wallMat);
  panel('room-left-wall',d,h,-halfW,my,0,0,Math.PI/2,0,sideMat);
  panel('room-right-wall',d,h,halfW,my,0,0,-Math.PI/2,0,sideMat);
  panel('room-front-wall',w,h,0,my,frontZ,0,Math.PI,0,frontMat);
  const box=(name,sx,sy,sz,x,y,z)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),trimMat);b.name=name;b.position.set(x,y,z);b.renderOrder=-900;group.add(b);return b};
  const t=12,base=18;
  box('base-back',w,base,t,0,floorY+base/2,backZ+t/2);box('base-front',w,base,t,0,floorY+base/2,frontZ-t/2);box('base-left',t,base,d,-halfW+t/2,floorY+base/2,0);box('base-right',t,base,d,halfW-t/2,floorY+base/2,0);
  box('ceiling-back',w,t,t,0,topY-t/2,backZ+t/2);box('ceiling-front',w,t,t,0,topY-t/2,frontZ-t/2);box('ceiling-left',t,t,d,-halfW+t/2,topY-t/2,0);box('ceiling-right',t,t,d,halfW-t/2,topY-t/2,0);
  const line=(pts,m=edgeMat)=>{const g=new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])));const l=new THREE.Line(g,m);l.renderOrder=-800;group.add(l);return l};
  const xL=-halfW,xR=halfW,zB=backZ,zF=frontZ;
  [[xL,floorY,zB,xL,topY,zB],[xR,floorY,zB,xR,topY,zB],[xL,floorY,zF,xL,topY,zF],[xR,floorY,zF,xR,topY,zF],[xL,floorY,zB,xR,floorY,zB],[xL,floorY,zF,xR,floorY,zF],[xL,floorY,zB,xL,floorY,zF],[xR,floorY,zB,xR,floorY,zF],[xL,topY,zB,xR,topY,zB],[xL,topY,zF,xR,topY,zF],[xL,topY,zB,xL,topY,zF],[xR,topY,zB,xR,topY,zF]].forEach(a=>line([[a[0],a[1],a[2]],[a[3],a[4],a[5]]]));
  for(let x=-2100;x<=2100;x+=420)line([[x,floorY+2,zB],[x,floorY+2,zF]],gridMat);
  for(let z=-2100;z<=2100;z+=420)line([[xL,floorY+3,z],[xR,floorY+3,z]],gridMat);
  return group;
}
addRoom();

const gameGroup=new THREE.Group();gameGroup.name='yakolak-game-on-table';scene.add(gameGroup);
function addGame(o){gameGroup.add(o);return o}
function alignGameToTable(tableObj){
  gameGroup.updateWorldMatrix(true,true);
  tableObj.updateWorldMatrix(true,true);
  const tb=new THREE.Box3().setFromObject(tableObj),gb=new THREE.Box3().setFromObject(gameGroup);
  if(tb.isEmpty()||gb.isEmpty())return;
  const offset=tb.max.y+TABLE_CONTACT_EPS-gb.min.y;
  gameGroup.position.y+=offset;
  log('game aligned to table',{tableTop:tb.max.y,gameBottom:gb.min.y,offsetY:gameGroup.position.y});
}

const stl=new STLLoader(),objLoader=new OBJLoader(),tex=new THREE.TextureLoader();tex.setCrossOrigin('anonymous');
const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#161616',roughness:.54,metalness:.04});
const mats={right:makeMat({color:'#fff',roughness:.92,metalness:0}),left:makeMat({color:'#8a570f',roughness:.58,metalness:.16}),front:makeMat({color:'#006144',roughness:.58,metalness:.08}),back:makeMat({color:'#001f8f',roughness:.74,metalness:0})};
const D=48,R3=135,TYPES=['l','m','s'],ORDER=['right','left','front','back'];
const A={'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:R3,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-R3,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:R3,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-R3,rx:-90,ry:0,rz:-90}};
const LID={px:0,py:62.5,pz:0,rx:-90,ry:180,rz:0};
const WALL={right:{px:81,py:35,pz:0,rx:-90,ry:-90,rz:0},left:{px:-81,py:35,pz:0,rx:-90,ry:90,rz:180},front:{px:0,py:35,pz:81,rx:-180,ry:0,rz:90},back:{px:0,py:35,pz:-81,rx:-180,ry:180,rz:-90}};
const T={lidShake:420,lidLift:900,lidH:740,wallDelay:360,wallLift:260,wallMove:620,wallDrop:280,pieceLead:360,pieceMove:850,pieceArc:30,pieceStagger:42};
let meshes={},lid,pieces=[],loaded=false,playing=false,start=0,raf=0,tableMaps={};
const rad=v=>THREE.MathUtils.degToRad(v);
function set(o){o.castShadow=false;o.receiveShadow=false;return o}
function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function ease(t){t=Math.max(0,Math.min(1,t));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function mix(a,b,t){t=ease(t);return{px:a.px+(b.px-a.px)*t,py:a.py+(b.py-a.py)*t,pz:a.pz+(b.pz-a.pz)*t,rx:a.rx+(b.rx-a.rx)*t,ry:a.ry+(b.ry-a.ry)*t,rz:a.rz+(b.rz-a.rz)*t}}
function uv(g){g.computeBoundingBox();g.computeVertexNormals();const p=g.getAttribute('position'),n=g.getAttribute('normal'),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),out=[],sx=s.x||1,sy=s.y||1,sz=s.z||1;for(let i=0;i<p.count;i++){const x=p.getX(i)-b.min.x,y=p.getY(i)-b.min.y,z=p.getZ(i)-b.min.z,nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let u,v;if(nz>=nx&&nz>=ny){u=x/sx;v=y/sy}else if(nx>=ny&&nx>=nz){u=z/sz;v=y/sy}else{u=x/sx;v=z/sz}out.push(u,v)}g.setAttribute('uv',new THREE.Float32BufferAttribute(out,2));return g}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);return uv(g)}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);return uv(g)}
function load(n,prep){return new Promise((res,rej)=>stl.load(modelPath(n),g=>res(prep(g)),undefined,()=>rej(new Error(n))))}
function loadObj(url){return new Promise((res,rej)=>objLoader.load(url,res,undefined,rej))}
function prepTableTex(t,isColor=false){if(isColor)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t}
function loadSoftTexture(url,label,isColor=false){return new Promise(res=>tex.load(url,t=>{prepTableTex(t,isColor);log(label,'restored');res(t)},undefined,e=>{log(label,'failed',e);res(null)}))}
async function loadTableTextures(){const [albedo,normal,roughness]=await Promise.all([loadSoftTexture(TABLE_ALBEDO_URL,'table albedo',true),loadSoftTexture(TABLE_NORMAL_URL,'table normal'),loadSoftTexture(TABLE_ROUGHNESS_URL,'table roughness')]);tableMaps={albedo,normal,roughness};return tableMaps}
function tableMaterial(){const mat=makeMat({color:'#c79a64',roughness:.72,metalness:0});if(tableMaps.albedo){mat.map=tableMaps.albedo;mat.color.set(0xffffff)}if(tableMaps.normal){mat.normalMap=tableMaps.normal;mat.normalScale.set(.75,.75)}if(tableMaps.roughness){mat.roughnessMap=tableMaps.roughness;mat.roughness=.92}mat.needsUpdate=true;return mat}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function bases(){return [{dir:'right',x:R3,z:0,ang:90},{dir:'left',x:-R3,z:0,ang:90},{dir:'front',x:0,z:R3,ang:0},{dir:'back',x:0,z:-R3,ang:0}]}
function finals(){const a=[];bases().forEach(b=>[-1,0,1].forEach(side=>{const r=rad(b.ang);a.push({dir:b.dir,side,px:b.x+Math.cos(r)*D*side,py:2,pz:b.z+Math.sin(r)*D*side,rx:-90,ry:0,rz:0})}));return a}
function makePieces(geos){const rand=rng(4128),fs=finals();fs.forEach(f=>TYPES.forEach(type=>{const r=rand()*Math.PI*2,rr=rand()*78,mesh=set(new THREE.Mesh(geos[type],mats[f.dir]));const start={px:Math.cos(r)*rr,py:10+rand()*18,pz:Math.sin(r)*rr,rx:-90+(rand()*2-1)*20,ry:(rand()*2-1)*20,rz:Math.round(rand()*360)};const p={mesh,dir:f.dir,side:f.side,start,final:{...f}};pieces.push(p);addGame(mesh);tr(mesh,start)}))}
function lidAt(ms){const p={...LID};if(ms<T.lidShake){const f=1-ms/T.lidShake,w=Math.sin(ms*.12)*2.8*f;p.rx+=w*.45;p.rz+=Math.sin(ms*.07)*1.2*f;return p}p.py+=T.lidH*ease((ms-T.lidShake)/T.lidLift);return p}
function wallAt(k,ms){const i=ORDER.indexOf(k),st=WALL[k],fn=A['3-'+k],start=T.lidShake+i*T.wallDelay;let t=ms-start;if(t<=0)return st;const up={...st,py:st.py+20},upF={...fn,py:st.py+20};if(t<T.wallLift)return mix(st,up,t/T.wallLift);t-=T.wallLift;if(t<T.wallMove)return mix(up,upF,t/T.wallMove);t-=T.wallMove;if(t<T.wallDrop)return mix(upF,fn,t/T.wallDrop);return fn}
function pieceStart(p){const i=ORDER.indexOf(p.dir);return T.lidShake+i*T.wallDelay+T.wallLift+T.wallMove-T.pieceLead+(p.side+1)*T.pieceStagger}
function pieceAt(p,ms){const q=ease((ms-pieceStart(p))/T.pieceMove),m=mix(p.start,p.final,q);m.py+=Math.sin(q*Math.PI)*T.pieceArc;return m}
function total(){return T.lidShake+3*T.wallDelay+T.wallLift+T.wallMove+T.wallDrop+T.pieceMove+500}
function apply(ms){tr(meshes['9'],A['9']);if(lid){tr(lid,lidAt(ms));lid.visible=ms<T.lidShake+T.lidLift}ORDER.forEach(k=>tr(meshes['3-'+k],wallAt(k,ms)));pieces.forEach(p=>tr(p.mesh,pieceAt(p,ms)));if(ms>=total())snap()}
function snap(){tr(meshes['9'],A['9']);ORDER.forEach(k=>tr(meshes['3-'+k],A['3-'+k]));pieces.forEach(p=>tr(p.mesh,p.final));if(lid)lid.visible=false}
function fallbackTable(){const g=new THREE.Group();g.name='yakolak-fallback-simple-table';const topMat=tableMaterial(),sideMat=makeMat({color:'#7a4b27',roughness:.82,metalness:0});const top=set(new THREE.Mesh(new THREE.BoxGeometry(680,32,540),topMat));top.position.y=TABLE_TOP_Y-16;g.add(top);const legGeo=new THREE.BoxGeometry(38,TABLE_TOP_Y-ROOM_CFG.floorY,38);[[-275,-210],[275,-210],[-275,210],[275,210]].forEach(([x,z])=>{const leg=set(new THREE.Mesh(legGeo,sideMat));leg.position.set(x,ROOM_CFG.floorY+(TABLE_TOP_Y-ROOM_CFG.floorY)/2,z);g.add(leg)});scene.add(g);return g}
async function realTable(){
  try{
    const [obj]=await Promise.all([loadObj(TABLE_OBJ_URL),loadTableTextures()]);
    const group=new THREE.Group();group.name='yakolak-real-mars-table';
    const tableMat=tableMaterial();
    obj.traverse(o=>{if(o.isMesh){o.material=tableMat;o.castShadow=false;o.receiveShadow=false;if(o.geometry)o.geometry.computeVertexNormals()}});
    group.add(obj);scene.add(group);
    const rawBox=new THREE.Box3().setFromObject(obj),rawSize=rawBox.getSize(new THREE.Vector3());
    const targetH=TABLE_TOP_Y-ROOM_CFG.floorY;
    const s=rawSize.y?targetH/rawSize.y:1400;
    obj.scale.set(s*1.35,s,s*1.35);
    let b=new THREE.Box3().setFromObject(obj);
    obj.position.x-=((b.min.x+b.max.x)/2);
    obj.position.z-=((b.min.z+b.max.z)/2);
    obj.position.y+=TABLE_TOP_Y-b.max.y;
    group.rotation.y=Math.PI/4;
    log('real table restored with original texture maps',TABLE_OBJ_URL);
    return group;
  }catch(e){
    console.warn('[Yakolak] real table failed, fallback table used',e);
    if(!tableMaps.albedo)await loadTableTextures();
    return fallbackTable();
  }
}
function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();keepInsideRoom()}
function frame(now){if(!playing)return;const e=now-start;apply(Math.min(e,total()));render();if(e<total())raf=requestAnimationFrame(frame);else{playing=false;snap();render()}}
function replay(){if(!loaded)return;cancelAnimationFrame(raf);start=performance.now();playing=true;if(lid)lid.visible=true;apply(0);render();raf=requestAnimationFrame(frame)}
function marble(){tex.load(MARBLE_URL,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();mats.right.map=t;mats.right.needsUpdate=true;render()},undefined,()=>{})}
async function boot(){try{const [g9,g3,gl,gm,gs]=await Promise.all([load('9',center),load('3',center),load('l',bottom),load('m',bottom),load('s',bottom)]);const objects=[];meshes['9']=set(new THREE.Mesh(g9,baseMat));addGame(meshes['9']);objects.push(meshes['9']);ORDER.forEach(k=>{meshes['3-'+k]=set(new THREE.Mesh(g3,baseMat));addGame(meshes['3-'+k]);objects.push(meshes['3-'+k])});lid=set(new THREE.Mesh(g9,baseMat));addGame(lid);makePieces({l:gl,m:gm,s:gs});apply(0);const tableObj=await realTable();alignGameToTable(tableObj);objects.push(...pieces.map(p=>p.mesh),tableObj);fit(objects);loaded=true;render();requestAnimationFrame(()=>requestAnimationFrame(done));replay();marble();log('prod stage1 ready - table contact alignment active')}catch(e){fail(e)}}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render()},{passive:true});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')replay()});
boot();
