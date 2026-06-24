import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';

const BUILD='60';
const MODEL_DIR='./assets/models/';
const MARBLE_URL='https://i.ibb.co/B2h2tNKG/Screenshot-2026-06-22-094236.png';
const modelPath=n=>`${MODEL_DIR}${n}.stl?v=${BUILD}-${n}`;
const root=document.getElementById('view');
const loaderEl=document.getElementById('yakolakLoader');
const loaderText=document.getElementById('yakolakLoaderText');
const log=(...a)=>console.info('[Yakolak]',...a);
function status(t){if(loaderText)loaderText.textContent=t;log(t)}
function reveal(){if(root)root.style.opacity='1';if(loaderEl){loaderEl.classList.add('done');setTimeout(()=>loaderEl.remove(),420)}}
function fatal(e){console.error('[Yakolak] fast load error',e);if(loaderEl)loaderEl.classList.add('error');if(loaderText)loaderText.textContent='تعذر التحميل، اضغط زر مسح ثم افتحها من جديد'}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xf7f4ee);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,12000);
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio||1,1),1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=false;
root.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false;
controls.minDistance=170;
controls.maxDistance=1400;
controls.addEventListener('change',render);
function render(){renderer.render(scene,camera)}

scene.add(new THREE.HemisphereLight(0xfff8ec,0x505866,.82));
const key=new THREE.DirectionalLight(0xffead0,1.18);key.position.set(180,280,180);scene.add(key);
const fill=new THREE.DirectionalLight(0xcbd8ff,.32);fill.position.set(-240,160,-220);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffff,.28);rim.position.set(-180,230,280);scene.add(rim);

const loader=new STLLoader();
const texLoader=new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const palette={board:{color:'#161616',roughness:.54,metalness:.04},white:{color:'#ffffff',roughness:.92,metalness:0},gold:{color:'#8a570f',roughness:.58,metalness:.18},green:{color:'#006144',roughness:.56,metalness:.10},blue:{color:'#001f8f',roughness:.72,metalness:0},table:{color:'#c79a64',roughness:.82,metalness:0},side:{color:'#7a4b27',roughness:.86,metalness:0}};
const mat=p=>new THREE.MeshStandardMaterial(p);
const baseMat=mat(palette.board),mats={right:mat(palette.white),left:mat(palette.gold),front:mat(palette.green),back:mat(palette.blue)};
const gameMeshes=[];
const rad=v=>THREE.MathUtils.degToRad(v);
function set(o){o.castShadow=false;o.receiveShadow=false;return o}
function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function uv(g){g.computeBoundingBox();g.computeVertexNormals();const p=g.getAttribute('position'),n=g.getAttribute('normal'),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),out=[],sx=s.x||1,sy=s.y||1,sz=s.z||1;for(let i=0;i<p.count;i++){const x=p.getX(i)-b.min.x,y=p.getY(i)-b.min.y,z=p.getZ(i)-b.min.z,nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let u,v;if(nz>=nx&&nz>=ny){u=x/sx;v=y/sy}else if(nx>=ny&&nx>=nz){u=z/sz;v=y/sy}else{u=x/sx;v=z/sz}out.push(u,v)}g.setAttribute('uv',new THREE.Float32BufferAttribute(out,2));return g}
function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);return uv(g)}
function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);return uv(g)}
function loadSTL(n,prep){return new Promise((res,rej)=>loader.load(modelPath(n),g=>res(prep(g)),undefined,()=>rej(new Error('model failed '+n))))}
const A={'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:135,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-135,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:135,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-135,rx:-90,ry:0,rz:-90}};
const bases=[['right',135,0,90],['left',-135,0,90],['front',0,135,0],['back',0,-135,0]];
function table(){const g=new THREE.Group(),topMat=mat(palette.table),sideMat=mat(palette.side);const top=set(new THREE.Mesh(new THREE.BoxGeometry(470,24,360),topMat));top.position.y=-13;g.add(top);const legGeo=new THREE.BoxGeometry(28,260,28);[[-190,-130],[190,-130],[-190,130],[190,130]].forEach(([x,z])=>{const leg=set(new THREE.Mesh(legGeo,sideMat));leg.position.set(x,-155,z);g.add(leg)});scene.add(g);return g}
function pieces(geos){const types=['l','m','s'];bases.forEach(([dir,bx,bz,ang])=>[-1,0,1].forEach(side=>types.forEach(type=>{const r=rad(ang),x=bx+Math.cos(r)*48*side,z=bz+Math.sin(r)*48*side;const mesh=set(new THREE.Mesh(geos[type],mats[dir]));scene.add(mesh);gameMeshes.push(mesh);tr(mesh,{px:x,py:2,pz:z,rx:-90,ry:0,rz:0})}))) }
function marble(){texLoader.load(MARBLE_URL,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();mats.right.map=t;mats.right.needsUpdate=true;render()},undefined,()=>{})}
function fitCamera(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update()}
async function boot(){try{status('تحميل سريع...');const [g9,g3,gl,gm,gs]=await Promise.all([loadSTL('9',center),loadSTL('3',center),loadSTL('l',bottom),loadSTL('m',bottom),loadSTL('s',bottom)]);const objects=[];const board=set(new THREE.Mesh(g9,baseMat));scene.add(board);tr(board,A['9']);objects.push(board);['right','left','front','back'].forEach(d=>{const m=set(new THREE.Mesh(g3,baseMat));scene.add(m);tr(m,A['3-'+d]);objects.push(m)});pieces({l:gl,m:gm,s:gs});objects.push(...gameMeshes);objects.push(table());fitCamera(objects);render();requestAnimationFrame(()=>requestAnimationFrame(reveal));marble();status('جاهز');log('FAST STATIC READY v'+BUILD)}catch(e){fatal(e)}}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render()},{passive:true});
boot();
