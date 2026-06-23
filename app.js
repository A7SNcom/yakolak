// Yakolak boot file.
// Keep the repository root clean for GitHub Pages.
// Live route: index.html -> app.js -> src/app-live.js

import * as THREE from 'three';

console.info('[Yakolak] APP.JS v046 ROOM PATCH LOADED');

const LIVE_APP = './src/app-live.js';
const bust = Date.now();
let activeScene=null, activeRenderer=null, activeCamera=null, drag=null;
const pointer=new THREE.Vector2(), raycaster=new THREE.Raycaster(), dragPlane=new THREE.Plane(), hit=new THREE.Vector3();

function makeLampLabel(txt){
  const c=document.createElement('canvas');c.width=160;c.height=160;
  const x=c.getContext('2d');
  x.fillStyle='rgba(0,0,0,.82)';x.beginPath();x.arc(80,80,58,0,Math.PI*2);x.fill();
  x.strokeStyle='rgba(255,255,255,1)';x.lineWidth=8;x.stroke();
  x.fillStyle='#fff';x.font='900 74px system-ui,Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,80,83);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false,transparent:true}));
  sp.scale.set(48,48,1);sp.position.set(0,58,0);sp.renderOrder=20001;sp.frustumCulled=false;
  return sp;
}

function makeRoom(scene){
  if(scene.getObjectByName('yakolak-forced-room'))return;
  const room=new THREE.Group();room.name='yakolak-forced-room';
  const floorY=-330, topY=560, roomH=topY-floorY, roomW=1700, roomD=1700, half=roomW/2, backZ=-690;
  const floorMat=new THREE.MeshStandardMaterial({color:0xe6dfd2,roughness:.97,metalness:0});
  const wallMat=new THREE.MeshStandardMaterial({color:0xf2eee5,roughness:.98,metalness:0,side:THREE.DoubleSide});
  const ceilMat=new THREE.MeshStandardMaterial({color:0xf9f6ef,roughness:1,metalness:0,side:THREE.DoubleSide});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(0,floorY,0);floor.receiveShadow=true;room.add(floor);
  const grid=new THREE.GridHelper(roomW,34,0xcfc5b7,0xded6ca);grid.position.y=floorY+1;grid.material.transparent=true;grid.material.opacity=.36;room.add(grid);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),ceilMat);ceil.rotation.x=Math.PI/2;ceil.position.set(0,topY,0);ceil.receiveShadow=true;room.add(ceil);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomH),wallMat);back.position.set(0,floorY+roomH/2,backZ);back.receiveShadow=true;room.add(back);
  const left=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);left.rotation.y=Math.PI/2;left.position.set(-half,floorY+roomH/2,0);left.receiveShadow=true;room.add(left);
  const right=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);right.rotation.y=-Math.PI/2;right.position.set(half,floorY+roomH/2,0);right.receiveShadow=true;room.add(right);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(roomW,roomH,roomD)),new THREE.LineBasicMaterial({color:0xc8bcad,transparent:true,opacity:.32}));edges.position.set(0,floorY+roomH/2,0);room.add(edges);
  scene.add(room);
  console.info('[Yakolak] FORCED 3D ROOM ACTIVE',{floorY,topY,roomW,roomD});
}

function makeForcedLamps(scene){
  if(scene.getObjectByName('yakolak-forced-lamps'))return;
  const root=new THREE.Group();root.name='yakolak-forced-lamps';
  const data=[
    ['1','#fff2c7',[-135,88,115],4.8,900],
    ['2','#cfe1ff',[135,88,-115],4.0,860],
    ['3','#ffffff',[0,138,0],4.4,880]
  ];
  data.forEach(([num,color,pos,intensity,distance])=>{
    const g=new THREE.Group();g.name='lamp-'+num;g.userData.forcedLamp=true;
    const light=new THREE.PointLight(color,intensity,distance,1);light.name='light-'+num;g.add(light);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(28,32,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthTest:false,depthWrite:false}));
    mesh.name='lamp-ball-'+num;mesh.userData.forcedLampBall=true;mesh.renderOrder=20000;mesh.frustumCulled=false;g.add(mesh);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(62,32,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.30,depthTest:false,depthWrite:false}));
    halo.name='lamp-halo-'+num;halo.renderOrder=19999;halo.frustumCulled=false;g.add(halo);
    g.add(makeLampLabel(num));g.position.set(...pos);root.add(g);
  });
  scene.add(root);
  console.info('[Yakolak] FORCED DRAGGABLE LAMPS ACTIVE');
}

function setPointer(e,renderer){const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1}
function installDrag(renderer,camera,scene){
  if(renderer.domElement.__yakolakForcedDrag)return;
  renderer.domElement.__yakolakForcedDrag=true;
  renderer.domElement.addEventListener('pointerdown',e=>{
    setPointer(e,renderer);raycaster.setFromCamera(pointer,camera);
    const balls=[];scene.traverse(o=>{if(o.userData?.forcedLampBall)balls.push(o)});
    const h=raycaster.intersectObjects(balls,false)[0];
    if(!h)return;
    drag=h.object.parent;dragPlane.set(new THREE.Vector3(0,1,0),-drag.position.y);
    renderer.domElement.setPointerCapture?.(e.pointerId);e.preventDefault();e.stopPropagation();
  },true);
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!drag)return;
    setPointer(e,renderer);raycaster.setFromCamera(pointer,camera);
    if(raycaster.ray.intersectPlane(dragPlane,hit)){drag.position.x=hit.x;drag.position.z=hit.z}
    e.preventDefault();e.stopPropagation();
  },true);
  renderer.domElement.addEventListener('pointerup',e=>{drag=null;renderer.domElement.releasePointerCapture?.(e.pointerId)},true);
}

function forceVisualScene(scene,camera,renderer){
  scene.background=new THREE.Color(0xf2eee5);
  makeRoom(scene);
  makeForcedLamps(scene);
  installDrag(renderer,camera,scene);
}

function installScenePatch(){
  if(THREE.WebGLRenderer.prototype.__yakolakForcedRoomPatch)return;
  THREE.WebGLRenderer.prototype.__yakolakForcedRoomPatch=true;
  const originalRender=THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render=function(scene,camera){
    activeScene=scene;activeRenderer=this;activeCamera=camera;
    try{forceVisualScene(scene,camera,this)}catch(e){console.warn('[Yakolak] forced room skipped',e)}
    return originalRender.call(this,scene,camera);
  };
}

installScenePatch();
import(LIVE_APP + '?b=' + bust);
