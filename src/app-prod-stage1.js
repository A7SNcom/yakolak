import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';

const BUILD='63';
const MODEL_DIR='./assets/models/';
const MARBLE_URL='https://i.ibb.co/B2h2tNKG/Screenshot-2026-06-22-094236.png';
const modelPath=n=>`${MODEL_DIR}${n}.stl?v=${BUILD}-${n}`;
const root=document.getElementById('view');
const loaderEl=document.getElementById('yakolakLoader');
const log=(...a)=>console.info('[Yakolak]',...a);
function done(){if(root)root.style.opacity='1';if(loaderEl){loaderEl.classList.add('done');setTimeout(()=>loaderEl.remove(),420)}}
function fail(e){console.error('[Yakolak] prod stage1 error',e);if(loaderEl)loaderEl.classList.add('error')}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xf7f4ee);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,12000);
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio||1,1),1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.04;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);
function render(){renderer.render(scene,camera)}

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false;
controls.minDistance=180;
controls.maxDistance=1350;
controls.addEventListener('change',render);

scene.add(new THREE.HemisphereLight(0xfff7ed,0x59616b,.86));
const key=new THREE.DirectionalLight(0xffe8c8,1.18);key.position.set(180,280,160);scene.add(key);
const rim=new THREE.DirectionalLight(0xffffff,.28);rim.position.set(-150,230,260);scene.add(rim);

function addRoom(){
  const floorY=-430,topY=1180,halfW=2400,backZ=-2400,frontZ=2400;
  const w=halfW*2,d=frontZ-backZ,h=topY-floorY,my=floorY+h/2;
  const m=c=>new THREE.MeshStandardMaterial({color:c,roughness:1,metalness:0,side:THREE.FrontSide});
  const panel=(name,W,H,x,y,z,rx,ry,rz,mat)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(W,H),mat);p.name=name;p.position.set(x,y,z);p.rotation.set(rx,ry,rz);p.renderOrder=-1000;scene.add(p)};
  const floor=m(0xe9e4da),ceil=m(0xfaf8f1),wall=m(0xf4f0e8),front=m(0xf4f0e8);front.transparent=true;front.opacity=.08;front.depthWrite=false;
  panel('room-floor',w,d,0,floorY,0,-Math.PI/2,0,0,floor);
  panel('room-ceiling',w,d,0,topY,0,Math.PI/2,0,0,ceil);
  panel('room-back',w,h,0,my,backZ,0,0,0,wall);
  panel('room-left',d,h,-halfW,my,0,0,Math.PI/2,0,wall);
  panel('room-right',d,h,halfW,my,0,0,-Math.PI/2,0,wall);
  panel('room-front',w,h,0,my,frontZ,0,Math.PI,0,front);
}
addRoom();

const stl=new STLLoader(),tex=new THREE.TextureLoader();tex.setCrossOrigin('anonymous');
const makeMat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=makeMat({color:'#161616',roughness:.54,metalness:.04});
const mats={right:makeMat({color:'#fff',roughness:.92,metalness:0}),left:makeMat({color:'#8a570f',roughness:.58,metalness:.16}),front:makeMat({color:'#006144',roughness:.58,metalness:.08}),back:makeMat({color:'#001f8f',roughness:.74,metalness:0})};
const D=48,R3=135,TYPES=['l','m','s'],ORDER=['right','left','front','back'];
const A={'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:R3,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-R3,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:R3,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-R3,rx:-90,ry:0,rz:-90}};
const LID={px:0,py:62.5,pz:0,rx:-90,ry:180,rz:0};
const WALL={right:{px:81,py:35,pz:0,rx:-90,ry:-90,rz:0},left:{px:-81,py:35,pz:0,rx:-90,ry:90,rz:180},front:{px:0,py:35,pz:81,rx:-180,ry:0,rz:90},back:{px:0,py:35,pz:-81,rx:-180,ry:180,rz:-90}};
const T={lidShake:420,lidLift:900,lidH:740,wallDelay:360,wallLift:260,wallMove:620,wallDrop:280,pieceLead:360,pieceMove:850,pieceArc:30,pieceStagger:42};
let meshes={},lid,pieces=[],loaded=false,playing=false,start=0,raf=0;
const rad=v=>THREE.MathUtils.degToRad(v);
function set(o){o.castShadow=false;o.receiveShadow=false;return o}
function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function ease(t){t=Math.max(0,Math.min(1,t));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function mix(a,b,t){t=ease(t);return{px:a.px+(b.px-a.px)*t,py:a.py+(b.py-a.py)*t,pz:a.pz+(b.pz-a.pz)*t,rx:a.rx+(b.rx-a.rx)*t,ry:a.ry+(b.ry-a.ry)*t,rz:a.rz+(b.rz-a.rz)*t}}
function uv(g){g.computeBoundingBox();g.computeVertexNormals();const p=g.getAttribute('position'),n=g.getAttribute('normal'),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),out=[],sx=s.x||1,sy=s.y||1,sz=s.z||1;for(let i=0;i<p.count;i++){const x=p.getX(i)-b.min.x,y=p.getY(i)-b.min.y,z=p.getZ(i)-b.min.z,nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let u,v;if(nz>=nx&&nz>=ny){u=x/sx;v=y/sy}else if(nx>=ny&&nx>=nz){u=z/sz;v=y/sy}else{u=x/sx;v=z/sz}out.push(u,v)}g.setAttribute('uv',new THREE.Float32BufferAttribute(out,2));return g}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);return uv(g)}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);return uv(g)}
function load(n,prep){return new Promise((res,rej)=>stl.load(modelPath(n),g=>res(prep(g)),undefined,()=>rej(new Error(n))))}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function bases(){return [{dir:'right',x:R3,z:0,ang:90},{dir:'left',x:-R3,z:0,ang:90},{dir:'front',x:0,z:R3,ang:0},{dir:'back',x:0,z:-R3,ang:0}]}
function finals(){const a=[];bases().forEach(b=>[-1,0,1].forEach(side=>{const r=rad(b.ang);a.push({dir:b.dir,side,px:b.x+Math.cos(r)*D*side,py:2,pz:b.z+Math.sin(r)*D*side,rx:-90,ry:0,rz:0})}));return a}
function makePieces(geos){const rand=rng(4128),fs=finals();fs.forEach(f=>TYPES.forEach(type=>{const r=rand()*Math.PI*2,rr=rand()*78,mesh=set(new THREE.Mesh(geos[type],mats[f.dir]));const start={px:Math.cos(r)*rr,py:10+rand()*18,pz:Math.sin(r)*rr,rx:-90+(rand()*2-1)*20,ry:(rand()*2-1)*20,rz:Math.round(rand()*360)};const p={mesh,dir:f.dir,side:f.side,start,final:{...f}};pieces.push(p);scene.add(mesh);tr(mesh,start)}))}
function lidAt(ms){const p={...LID};if(ms<T.lidShake){const f=1-ms/T.lidShake,w=Math.sin(ms*.12)*2.8*f;p.rx+=w*.45;p.rz+=Math.sin(ms*.07)*1.2*f;return p}p.py+=T.lidH*ease((ms-T.lidShake)/T.lidLift);return p}
function wallAt(k,ms){const i=ORDER.indexOf(k),st=WALL[k],fn=A['3-'+k],start=T.lidShake+i*T.wallDelay;let t=ms-start;if(t<=0)return st;const up={...st,py:st.py+20},upF={...fn,py:st.py+20};if(t<T.wallLift)return mix(st,up,t/T.wallLift);t-=T.wallLift;if(t<T.wallMove)return mix(up,upF,t/T.wallMove);t-=T.wallMove;if(t<T.wallDrop)return mix(upF,fn,t/T.wallDrop);return fn}
function pieceStart(p){const i=ORDER.indexOf(p.dir);return T.lidShake+i*T.wallDelay+T.wallLift+T.wallMove-T.pieceLead+(p.side+1)*T.pieceStagger}
function pieceAt(p,ms){const q=ease((ms-pieceStart(p))/T.pieceMove),m=mix(p.start,p.final,q);m.py+=Math.sin(q*Math.PI)*T.pieceArc;return m}
function total(){return T.lidShake+3*T.wallDelay+T.wallLift+T.wallMove+T.wallDrop+T.pieceMove+500}
function apply(ms){tr(meshes['9'],A['9']);if(lid){tr(lid,lidAt(ms));lid.visible=ms<T.lidShake+T.lidLift}ORDER.forEach(k=>tr(meshes['3-'+k],wallAt(k,ms)));pieces.forEach(p=>tr(p.mesh,pieceAt(p,ms)));if(ms>=total())snap()}
function snap(){tr(meshes['9'],A['9']);ORDER.forEach(k=>tr(meshes['3-'+k],A['3-'+k]));pieces.forEach(p=>tr(p.mesh,p.final));if(lid)lid.visible=false}
function table(){const g=new THREE.Group(),topMat=makeMat({color:'#c79a64',roughness:.82,metalness:0}),sideMat=makeMat({color:'#7a4b27',roughness:.86,metalness:0});const top=set(new THREE.Mesh(new THREE.BoxGeometry(470,24,360),topMat));top.position.y=-13;g.add(top);const legGeo=new THREE.BoxGeometry(28,260,28);[[-190,-130],[190,-130],[-190,130],[190,130]].forEach(([x,z])=>{const leg=set(new THREE.Mesh(legGeo,sideMat));leg.position.set(x,-155,z);g.add(leg)});scene.add(g);return g}
function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update()}
function frame(now){if(!playing)return;const e=now-start;apply(Math.min(e,total()));render();if(e<total())raf=requestAnimationFrame(frame);else{playing=false;snap();render()}}
function replay(){if(!loaded)return;cancelAnimationFrame(raf);start=performance.now();playing=true;if(lid)lid.visible=true;apply(0);render();raf=requestAnimationFrame(frame)}
function marble(){tex.load(MARBLE_URL,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();mats.right.map=t;mats.right.needsUpdate=true;render()},undefined,()=>{})}
async function boot(){try{const [g9,g3,gl,gm,gs]=await Promise.all([load('9',center),load('3',center),load('l',bottom),load('m',bottom),load('s',bottom)]);const objects=[];meshes['9']=set(new THREE.Mesh(g9,baseMat));scene.add(meshes['9']);objects.push(meshes['9']);ORDER.forEach(k=>{meshes['3-'+k]=set(new THREE.Mesh(g3,baseMat));scene.add(meshes['3-'+k]);objects.push(meshes['3-'+k])});lid=set(new THREE.Mesh(g9,baseMat));scene.add(lid);makePieces({l:gl,m:gm,s:gs});objects.push(...pieces.map(p=>p.mesh),table());fit(objects);loaded=true;apply(0);render();requestAnimationFrame(()=>requestAnimationFrame(done));replay();marble();log('prod stage1 ready')}catch(e){fail(e)}}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render()},{passive:true});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')replay()});
boot();
