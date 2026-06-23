import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
const V='v041-hejaz-materials',D=48,R3=135,PR=85,PG=11;
const root=document.getElementById('view'),hint=document.getElementById('hint'),panel=document.getElementById('panel'),btn=document.getElementById('settingsBtn'),out=document.getElementById('out');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x111111);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);root.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x333333,2.4));
const light=new THREE.DirectionalLight(0xffffff,3.0);light.position.set(150,240,160);scene.add(light);
scene.add(new THREE.GridHelper(360,36,0x444444,0x252525));
const loader=new STLLoader(),meshes={},outerGroups=[],pMeshes=[];
const PALETTE={
  boardBase:{name:'board_black_satin',type:'standard',color:'#171717',roughness:.48,metalness:.18},
  p:{name:'p_gray_marble',type:'marble',base:'#b9bcc1',speck1:'#74787e',speck2:'#3f4348',density:72,roughness:.72,metalness:.06},
  right:{name:'white_marble',type:'marble',base:'#f3f3ef',speck1:'#8a8a8a',speck2:'#4f4f4f',density:70,roughness:.78,metalness:.04},
  left:{name:'dark_gold_satin',type:'standard',color:'#9d7423',roughness:.46,metalness:.74},
  front:{name:'metallic_green',type:'standard',color:'#2f806b',roughness:.34,metalness:.78},
  back:{name:'matte_blue',type:'standard',color:'#4c6d98',roughness:.84,metalness:.04}
};
function marbleTexture(p){const size=512,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.fillStyle=p.base;x.fillRect(0,0,size,size);for(let i=0;i<p.density;i++){const px=Math.random()*size,py=Math.random()*size,r=Math.random()*1.9+.35;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.globalAlpha=.12+Math.random()*.17;x.fillStyle=Math.random()>.55?p.speck1:p.speck2;x.fill()}x.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2.2,2.2);t.needsUpdate=true;return t}
function mat(p){return p.type==='marble'?new THREE.MeshStandardMaterial({color:p.base,roughness:p.roughness,metalness:p.metalness,map:marbleTexture(p)}):new THREE.MeshStandardMaterial({color:p.color,roughness:p.roughness,metalness:p.metalness})}
const baseMat=mat(PALETTE.boardBase),pMat=mat(PALETTE.p),mats={right:mat(PALETTE.right),left:mat(PALETTE.left),front:mat(PALETTE.front),back:mat(PALETTE.back)};
const baseIds=['9','3-right','3-left','3-front','3-back'];
const boardGrid=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]].map(([gx,gz],i)=>({id:'board-'+(i+1),gx,gz}));
const copies=[{id:'left',side:-1},{id:'center',side:0},{id:'right',side:1}],lms={px:0,py:2,pz:0,rx:-90,ry:0,rz:0};
function rad(v){return THREE.MathUtils.degToRad(v)}function center(g){g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);g.computeVertexNormals()}function bottom(g){g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);g.computeVertexNormals()}function tr(o,t){o.position.set(t.px,t.py,t.pz);o.rotation.set(rad(t.rx),rad(t.ry),rad(t.rz))}
function baseA(){return {'9':{px:0,py:6,pz:0,rx:-90,ry:0,rz:0},'3-right':{px:R3,py:6,pz:0,rx:-90,ry:0,rz:0},'3-left':{px:-R3,py:6,pz:0,rx:-90,ry:0,rz:180},'3-front':{px:0,py:6,pz:R3,rx:-90,ry:0,rz:90},'3-back':{px:0,py:6,pz:-R3,rx:-90,ry:0,rz:-90}}}
function bases(){return [{id:'right-base',dir:'right',px:R3,pz:0,mode:'side'},{id:'left-base',dir:'left',px:-R3,pz:0,mode:'side'},{id:'front-base',dir:'front',px:0,pz:R3,mode:'main'},{id:'back-base',dir:'back',px:0,pz:-R3,mode:'main'}]}
function pRows(){return {'p-front':{px:0,py:7,pz:PR,rx:-90,ry:0,rz:0,axis:'x'},'p-back':{px:0,py:7,pz:-PR,rx:-90,ry:0,rz:0,axis:'x'},'p-right':{px:PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'},'p-left':{px:-PR,py:7,pz:0,rx:-90,ry:0,rz:90,axis:'z'}}}
function boardPositions(){return boardGrid.map(c=>({id:c.id,px:c.gx*D,py:lms.py,pz:c.gz*D,rx:lms.rx,ry:lms.ry,rz:lms.rz,visible:false}))}
function off(side,b){const r=rad(b.mode==='side'?90:0);return {x:Math.cos(r)*D*side,z:Math.sin(r)*D*side}}
function pInstances(){const rows=pRows(),a=[];Object.keys(rows).forEach(k=>{const r=rows[k];for(let s=-3;s<=3;s++)a.push({id:k+'-'+(s+4),row:k,side:s,px:r.px+(r.axis==='x'?s*PG:0),py:r.py,pz:r.pz+(r.axis==='z'?s*PG:0),rx:r.rx,ry:r.ry,rz:r.rz})});return a}
function outerPositions(){const a=[];bases().forEach(b=>copies.forEach(c=>{const o=off(c.side,b);a.push({id:b.id+'-'+c.id,direction:b.dir,px:b.px+o.x,py:lms.py,pz:b.pz+o.z,rx:lms.rx,ry:lms.ry,rz:lms.rz,material:PALETTE[b.dir]})}));return a}
function refresh(){out.value='const YAKOLAK_HEJAZ_MATERIALS = '+JSON.stringify({version:V,ui_mode:'hejaz_materials_applied',palette:PALETTE,locked_layout:{stoneDistance:D,threeRadius:R3,pRadius:PR,pPieceGap:PG},models_alignment:{...baseA(),...pRows()},board_stones:{visible:false,positions:boardPositions()},outer_stones:{visible:true,positions:outerPositions()},p_model:{file:'p.stl',rows:pRows(),instances:pInstances()}},null,2)+';'}
function ui(){panel.innerHTML='<div class="top"><div><div class="title">خامات الحجاز</div><div class="meta">ماربل + معدني + مطفي مطبق</div></div><button class="btn" id="hideC">إخفاء</button></div><div class="choices"><button class="choice">البورد: أسود متوسط اللمعة</button><button class="choice">p: ماربل رمادي</button><button class="choice">يمين: أبيض ماربل</button><button class="choice">يسار: ذهبي غامق ساتان</button><button class="choice">أمام: أخضر معدني</button><button class="choice">خلف: أزرق مطفي</button></div><div class="grid"><button class="btn" id="copyC">Copy</button></div>';panel.querySelector('#hideC').onclick=()=>panel.classList.remove('show');panel.querySelector('#copyC').onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='materials copied'}}
ui();btn.onclick=()=>panel.classList.add('show');
function loadBase(id){return new Promise(res=>loader.load('./'+(id==='9'?'9':'3')+'.stl?v='+V+'-'+id,g=>{center(g);const m=new THREE.Mesh(g,baseMat);meshes[id]=m;scene.add(m);tr(m,baseA()[id]);res()},undefined,()=>res()))}
function makeOuter(){const parent=new THREE.Group();scene.add(parent);bases().forEach(b=>copies.forEach(c=>{const g=new THREE.Group();g.userData={baseId:b.id,dir:b.dir,side:c.side};const o=off(c.side,b);g.position.set(b.px+o.x,lms.py,b.pz+o.z);g.rotation.set(rad(lms.rx),rad(lms.ry),rad(lms.rz));parent.add(g);outerGroups.push(g)}))}
function loadPiece(n){return new Promise(res=>loader.load('./'+n+'.stl?v='+V+'-'+n,g=>{bottom(g);outerGroups.forEach(gr=>gr.add(new THREE.Mesh(g,mats[gr.userData.dir])));res()},undefined,()=>res()))}
function loadP(){return new Promise(res=>loader.load('./p.stl?v='+V,g=>{center(g);for(let i=0;i<28;i++){const m=new THREE.Mesh(g,pMat);pMeshes.push(m);scene.add(m)}pInstances().forEach((p,i)=>tr(pMeshes[i],p));res()},undefined,()=>res()))}
Promise.all(baseIds.map(loadBase)).then(()=>{makeOuter();return Promise.all([loadPiece('l'),loadPiece('m'),loadPiece('s'),loadP()])}).then(()=>{const box=new THREE.Box3();Object.values(meshes).forEach(m=>box.expandByObject(m));outerGroups.forEach(g=>box.expandByObject(g));pMeshes.forEach(m=>box.expandByObject(m));const size=box.getSize(new THREE.Vector3()),dist=(Math.max(size.x,size.y,size.z)||1)*1.75;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1000,.01);camera.far=dist*30;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();hint.textContent='Yakolak '+V;refresh()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();refresh();
