// Yakolak boot file.
// Keep the repository root clean for GitHub Pages.
// Live route: index.html -> app.js -> src/app-live.js

import * as THREE from 'three';

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

function makeLampLabel(txt){
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const x=c.getContext('2d');
  x.clearRect(0,0,128,128);
  x.fillStyle='rgba(0,0,0,.74)';x.beginPath();x.arc(64,64,46,0,Math.PI*2);x.fill();
  x.strokeStyle='rgba(255,255,255,.96)';x.lineWidth=6;x.stroke();
  x.fillStyle='#fff';x.font='900 58px system-ui,Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,64,66);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false,transparent:true}));
  sp.scale.set(34,34,1);sp.position.set(0,42,0);sp.renderOrder=10001;sp.frustumCulled=false;
  return sp;
}

function enhanceLamps(scene){
  scene.traverse(o=>{
    if(!o.userData || o.userData.lampIndex===undefined)return;
    const idx=Number(o.userData.lampIndex)+1;
    o.scale.setScalar(3.1);
    o.renderOrder=9999;
    o.frustumCulled=false;
    if(o.material){o.material.depthTest=false;o.material.depthWrite=false;o.material.opacity=1;o.material.transparent=true;o.material.needsUpdate=true}
    const g=o.parent;
    if(g && !g.userData.yakolakLampEnhanced){
      g.userData.yakolakLampEnhanced=true;
      g.add(makeLampLabel(String(idx)));
      g.children.forEach(ch=>{
        if(ch.isPointLight){ch.intensity=Math.max(ch.intensity||0,idx===1?2.4:idx===2?1.9:2.2);ch.distance=Math.max(ch.distance||0,idx===1?620:idx===2?580:600);ch.decay=Math.min(ch.decay||1,1)}
        if(ch.isMesh && ch!==o){ch.scale.setScalar(1.6);ch.renderOrder=9998;if(ch.material){ch.material.depthTest=false;ch.material.depthWrite=false;ch.material.opacity=.34;ch.material.transparent=true;ch.material.needsUpdate=true}}
      });
    }
  });
}

function sceneContentBox(scene){
  const box=new THREE.Box3();
  let found=false;
  scene.children.forEach(ch=>{
    if(ch.name==='yakolak-room-shell')return;
    if(ch.isLight || ch.isCamera || ch.isHelper)return;
    const b=new THREE.Box3().setFromObject(ch);
    if(Number.isFinite(b.min.x)&&Number.isFinite(b.max.x)&&!b.isEmpty()){
      box.union(b);found=true;
    }
  });
  return found?box:null;
}

function createRoomShell(scene){
  if(scene.getObjectByName('yakolak-room-shell'))return true;
  const box=sceneContentBox(scene);
  if(!box || !Number.isFinite(box.min.y) || box.min.y>-40)return false;

  const floorY=box.min.y-6;
  const topY=Math.max(760,box.max.y+360);
  const roomH=topY-floorY;
  const roomW=1500, roomD=1500, halfW=roomW/2, backZ=-650;

  const room=new THREE.Group();
  room.name='yakolak-room-shell';

  const floorMat=new THREE.MeshStandardMaterial({color:0xe8e2d6,roughness:.96,metalness:0});
  const wallMat=new THREE.MeshStandardMaterial({color:0xf1eee7,roughness:.98,metalness:0,side:THREE.DoubleSide});
  const ceilMat=new THREE.MeshStandardMaterial({color:0xf7f4ee,roughness:1,metalness:0,side:THREE.DoubleSide});

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),floorMat);
  floor.rotation.x=-Math.PI/2;floor.position.set(0,floorY,0);floor.receiveShadow=true;room.add(floor);

  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),ceilMat);
  ceiling.rotation.x=Math.PI/2;ceiling.position.set(0,topY,0);ceiling.receiveShadow=true;room.add(ceiling);

  const back=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomH),wallMat);
  back.position.set(0,floorY+roomH/2,backZ);back.receiveShadow=true;room.add(back);

  const left=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);
  left.rotation.y=Math.PI/2;left.position.set(-halfW,floorY+roomH/2,0);left.receiveShadow=true;room.add(left);

  const right=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);
  right.rotation.y=-Math.PI/2;right.position.set(halfW,floorY+roomH/2,0);right.receiveShadow=true;room.add(right);

  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(roomW,roomH,roomD)),new THREE.LineBasicMaterial({color:0xd5cec2,transparent:true,opacity:.20}));
  edges.position.set(0,floorY+roomH/2,0);room.add(edges);

  scene.add(room);
  scene.background=new THREE.Color(0xf1eee7);
  console.info('[Yakolak] real 3D room shell added',{floorY,topY,roomW,roomD});
  return true;
}

function installScenePatch(){
  if(THREE.WebGLRenderer.prototype.__yakolakRoomPatch)return;
  THREE.WebGLRenderer.prototype.__yakolakRoomPatch=true;
  const originalRender=THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render=function(scene,camera){
    try{
      enhanceLamps(scene);
      createRoomShell(scene);
    }catch(e){console.warn('[Yakolak] room/lamp patch skipped',e)}
    return originalRender.call(this,scene,camera);
  };
}

installScenePatch();
import(LIVE_APP + '?b=' + bust);
