import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
const V='v042-hejaz-materials-strong',D=48,R3=135,PR=85,PG=11;
const root=document.getElementById('view'),hint=document.getElementById('hint'),panel=document.getElementById('panel'),btn=document.getElementById('settingsBtn'),out=document.getElementById('out');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x777777);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;root.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2.8));
const l1=new THREE.DirectionalLight(0xffffff,3.8);l1.position.set(170,260,150);scene.add(l1);
const l2=new THREE.DirectionalLight(0x99ccff,1.4);l2.position.set(-180,140,-120);scene.add(l2);
const l3=new THREE.PointLight(0xffffff,1.8,700);l3.position.set(0,160,220);scene.add(l3);
scene.add(new THREE.GridHelper(360,36,0x555555,0x696969));
const loader=new STLLoader(),meshes={},outerGroups=[],pMeshes=[];
const PALETTE={
  boardBase:{name:'board_black_satin',type:'standard',color:'#161616',roughness:.36,metalness:.26},
  p:{name:'p_gray_marble_stronger',type:'marble',base:'#bfc2c7',speck1:'#686d73',speck2:'#25282c',density:190,roughness:.58,metalness:.08},
  right:{name:'white_marble_stronger',type:'marble',base:'#f4f1ea',speck1:'#777777',speck2:'#222222',density:180,roughness:.56,metalness:.06},
  left:{name:'dark_gold_satin_visible',type:'standard',color:'#a97718',roughness:.28,metalness:.92},
  front:{name:'metallic_green_visible',type:'standard',color:'#18805f',roughness:.20,metalness:.94},
  back:{name:'true_strong_blue_matte',type:'standard',color:'#0057b8',roughness:.62,metalness:.08}
};
function hexToRgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]}
function hash(x,y,z){return Math.abs(Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453)%1}
function colorizeGeo(g,p){const pos=g.getAttribute('position'),colors=[];const base=hexToRgb(p.base),s1=hexToRgb(p.speck1),s2=hexToRgb(p.speck2);for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);let c=base;const h=hash(Math.floor(x*0.18),Math.floor(y*0.18),Math.floor(z*0.18));const fine=hash(Math.floor(x*0.72),Math.floor(y*0.72),Math.floor(z*0.72));if(h>.62)c=h>.84?s2:s1;if(fine>.91)c=s2;const mix=(h>.62||fine>.91)?(.55+hash(x,y,z)*.35):0;colors.push(base[0]*(1-mix)+c[0]*mix,base[1]*(1-mix)+c[1]*mix,base[2]*(1-mix)+c[2]*mix)}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g}
function mat(p){return new THREE.MeshStandardMaterial({color:p.color||p.base,roughness:p.roughness,metalness:p.metalness,vertexColors:p.type==='marble'})}
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
function refresh(){out.value='const YAKOLAK_HEJAZ_MATERIALS = '+JSON.stringify({version:V,background:'#777777',method:'STL-safe procedural vertex color marble; no UV required',palette:PALETTE,locked_layout:{stoneDistance:D,threeRadius:R3,pRadius:PR,pPieceGap:PG},models_alignment:{...baseA(),...pRows()},board_stones:{visible:false,positions:boardPositions()},outer_stones:{visible:true,positions:outerPositions()},p_model:{file:'p.stl',rows:pRows(),instances:pInstances()}},null,2)+';'}
function ui(){panel.innerHTML='<div class="top"><div><div class="title">خامات الحجاز v042</div><div class="meta">ماربل أوضح + خلفية رمادي + أزرق قوي</div></div><button class="btn" id="hideC">إخفاء</button></div><div class="choices"><button class="choice">الخلفية: رمادي متوسط</button><button class="choice">البورد: أسود ساتان</button><button class="choice">p: ماربل رمادي أوضح</button><button class="choice">يمين: أبيض ماربل أوضح</button><button class="choice">يسار: ذهبي لامع ساتان</button><button class="choice">أمام: أخضر معدني أوضح</button><button class="choice">خلف: أزرق حقيقي قوي</button></div><div class="grid"><button class="btn" id="copyC">Copy</button></div>';panel.querySelector('#hideC').onclick=()=>panel.classList.remove('show');panel.querySelector('#copyC').onclick=async()=>{await navigator.clipboard.writeText(out.value);hint.textContent='materials copied'}}
ui();btn.onclick=()=>panel.classList.add('show');
function loadBase(id){return new Promise(res=>loader.load('./'+(id==='9'?'9':'3')+'.stl?v='+V+'-'+id,g=>{center(g);const m=new THREE.Mesh(g,baseMat);meshes[id]=m;scene.add(m);tr(m,baseA()[id]);res()},undefined,()=>res()))}
function makeOuter(){const parent=new THREE.Group();scene.add(parent);bases().forEach(b=>copies.forEach(c=>{const g=new THREE.Group();g.userData={baseId:b.id,dir:b.dir,side:c.side};const o=off(c.side,b);g.position.set(b.px+o.x,lms.py,b.pz+o.z);g.rotation.set(rad(lms.rx),rad(lms.ry),rad(lms.rz));parent.add(g);outerGroups.push(g)}))}
function loadPiece(n){return new Promise(res=>loader.load('./'+n+'.stl?v='+V+'-'+n,g=>{bottom(g);outerGroups.forEach(gr=>{let geo=g.clone();const p=PALETTE[gr.userData.dir];if(p.type==='marble')geo=colorizeGeo(geo,p);gr.add(new THREE.Mesh(geo,mats[gr.userData.dir]))});res()},undefined,()=>res()))}
function loadP(){return new Promise(res=>loader.load('./p.stl?v='+V,g=>{center(g);for(let i=0;i<28;i++){const geo=colorizeGeo(g.clone(),PALETTE.p);const m=new THREE.Mesh(geo,pMat);pMeshes.push(m);scene.add(m)}pInstances().forEach((p,i)=>tr(pMeshes[i],p));res()},undefined,()=>res()))}
Promise.all(baseIds.map(loadBase)).then(()=>{makeOuter();return Promise.all([loadPiece('l'),loadPiece('m'),loadPiece('s'),loadP()])}).then(()=>{const box=new THREE.Box3();Object.values(meshes).forEach(m=>box.expandByObject(m));outerGroups.forEach(g=>box.expandByObject(g));pMeshes.forEach(m=>box.expandByObject(m));const size=box.getSize(new THREE.Vector3()),dist=(Math.max(size.x,size.y,size.z)||1)*1.75;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1000,.01);camera.far=dist*30;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();hint.textContent='Yakolak '+V;refresh()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();refresh();
