import * as THREE from 'three';
console.info('[Yakolak] ROOM BOOT v053 CENTERED TABLE ROOM LOADED');

const add0=THREE.Scene.prototype.add;
const load0=THREE.TextureLoader.prototype.load;
const render0=THREE.WebGLRenderer.prototype.render;

const B={
  floorY:-430,
  topY:1180,
  halfW:2400,
  backZ:-2400,
  frontZ:2400,
  camPad:260
};

function material(color){
  return new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,side:THREE.FrontSide});
}
function panel(scene,name,w,h,x,y,z,rx,ry,rz,mat){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
  mesh.name=name;
  mesh.position.set(x,y,z);
  mesh.rotation.set(rx,ry,rz);
  mesh.receiveShadow=true;
  mesh.renderOrder=-1000;
  add0.call(scene,mesh);
  return mesh;
}
function line(scene,name,a,b,opacity=.28){
  const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);
  const mesh=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xd2ccc1,transparent:true,opacity,depthWrite:false}));
  mesh.name=name;
  mesh.renderOrder=-900;
  add0.call(scene,mesh);
  return mesh;
}
function room(scene){
  if(!scene||scene.__yakolakRoom)return;
  scene.__yakolakRoom=true;
  scene.__yakolakRoomBounds=B;
  scene.background=new THREE.Color(0xf7f4ee);

  const w=B.halfW*2;
  const d=B.frontZ-B.backZ;
  const h=B.topY-B.floorY;
  const my=B.floorY+h/2;
  const cz=0;
  const floorMat=material(0xe9e4da);
  const ceilMat=material(0xfaf8f1);
  const wallMat=material(0xf4f0e8);
  const frontMat=material(0xf4f0e8);
  frontMat.transparent=true;
  frontMat.opacity=.08;
  frontMat.depthWrite=false;

  panel(scene,'yakolak-room-floor',w,d,0,B.floorY,cz,-Math.PI/2,0,0,floorMat);
  panel(scene,'yakolak-room-ceiling',w,d,0,B.topY,cz,Math.PI/2,0,0,ceilMat);
  panel(scene,'yakolak-room-back-wall',w,h,0,my,B.backZ,0,0,0,wallMat);
  panel(scene,'yakolak-room-left-wall',d,h,-B.halfW,my,cz,0,Math.PI/2,0,wallMat);
  panel(scene,'yakolak-room-right-wall',d,h,B.halfW,my,cz,0,-Math.PI/2,0,wallMat);
  panel(scene,'yakolak-room-front-wall',w,h,0,my,B.frontZ,0,Math.PI,0,frontMat);

  line(scene,'yakolak-room-back-floor-line',[-B.halfW,B.floorY,B.backZ],[B.halfW,B.floorY,B.backZ],.45);
  line(scene,'yakolak-room-front-floor-line',[-B.halfW,B.floorY,B.frontZ],[B.halfW,B.floorY,B.frontZ],.10);
  line(scene,'yakolak-room-left-back-corner',[-B.halfW,B.floorY,B.backZ],[-B.halfW,B.topY,B.backZ],.30);
  line(scene,'yakolak-room-right-back-corner',[B.halfW,B.floorY,B.backZ],[B.halfW,B.topY,B.backZ],.30);
  line(scene,'yakolak-room-left-front-corner',[-B.halfW,B.floorY,B.frontZ],[-B.halfW,B.topY,B.frontZ],.10);
  line(scene,'yakolak-room-right-front-corner',[B.halfW,B.floorY,B.frontZ],[B.halfW,B.topY,B.frontZ],.10);
  line(scene,'yakolak-room-left-floor-line',[-B.halfW,B.floorY,B.backZ],[-B.halfW,B.floorY,B.frontZ],.20);
  line(scene,'yakolak-room-right-floor-line',[B.halfW,B.floorY,B.backZ],[B.halfW,B.floorY,B.frontZ],.20);

  console.info('[Yakolak] CENTERED TABLE ROOM ACTIVE',{floorY:B.floorY,topY:B.topY,width:w,depth:d,backZ:B.backZ,frontZ:B.frontZ,center:[0,0,0]});
}
function clampCamera(scene,camera){
  if(!scene||!scene.__yakolakRoomBounds||!camera||!camera.position)return;
  const b=scene.__yakolakRoomBounds,p=camera.position;
  p.x=Math.max(-b.halfW+b.camPad,Math.min(b.halfW-b.camPad,p.x));
  p.y=Math.max(b.floorY+b.camPad,Math.min(b.topY-b.camPad,p.y));
  p.z=Math.max(b.backZ+b.camPad,Math.min(b.frontZ-b.camPad,p.z));
}

THREE.Scene.prototype.add=function(...objects){room(this);return add0.apply(this,objects)};
THREE.WebGLRenderer.prototype.render=function(scene,camera){clampCamera(scene,camera);return render0.call(this,scene,camera)};
THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){
  const s=String(url||'');
  if(s.includes('Asset%201big.svg')||s.includes('Asset 1big.svg')){
    console.info('[Yakolak] SVG background skipped; centered table room active');
    queueMicrotask(()=>onError&&onError(new Error('svg background disabled')));
    return new THREE.Texture();
  }
  return load0.call(this,url,onLoad,onProgress,onError);
};
import('./app.js?boot='+Date.now()+'&room=53');
