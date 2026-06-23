// Yakolak boot file.
// Live route: index.html -> app.js -> src/app-live.js
// This file installs one safe pre-boot visual layer only:
// - a real Three.js room built from geometry
// - blocking the old SVG background so the scene no longer depends on it

import * as THREE from 'three';

console.info('[Yakolak] APP.JS v048 TRUE ROOM BOOT LOADED');

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

function installTrueRoomBoot(){
  if(THREE.Scene.prototype.__yakolakTrueRoomBoot)return;
  THREE.Scene.prototype.__yakolakTrueRoomBoot=true;

  const originalSceneAdd=THREE.Scene.prototype.add;
  const originalTextureLoad=THREE.TextureLoader.prototype.load;

  function mat(color,roughness=1){
    return new THREE.MeshStandardMaterial({color,roughness,metalness:0,side:THREE.DoubleSide});
  }

  function addPanel(root,name,w,h,pos,rot,material){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
    mesh.name=name;
    mesh.position.set(pos[0],pos[1],pos[2]);
    mesh.rotation.set(rot[0],rot[1],rot[2]);
    mesh.receiveShadow=true;
    originalSceneAdd.call(root,mesh);
    return mesh;
  }

  function addLine(root,name,points,color=0xd7d1c7,opacity=.62){
    const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity}));
    line.name=name;
    originalSceneAdd.call(root,line);
    return line;
  }

  function ensureRoom(scene){
    if(!scene || scene.__yakolakTrueRoomAdded || scene.getObjectByName('yakolak-room-floor'))return;
    scene.__yakolakTrueRoomAdded=true;
    scene.background=new THREE.Color(0xf6f3ed);

    const floorY=-320;
    const topY=455;
    const wallH=topY-floorY;
    const wallMidY=floorY+wallH/2;
    const roomW=1320;
    const roomD=1220;
    const halfW=roomW/2;
    const backZ=-510;
    const frontZ=roomD/2;

    const floorMat=mat(0xe9e3d8,.98);
    const wallMat=mat(0xf6f3ed,1);
    const ceilMat=mat(0xfffdf8,1);

    addPanel(scene,'yakolak-room-floor',roomW,roomD,[0,floorY,40],[-Math.PI/2,0,0],floorMat);
    addPanel(scene,'yakolak-room-ceiling',roomW,roomD,[0,topY,40],[Math.PI/2,0,0],ceilMat);
    addPanel(scene,'yakolak-room-back-wall',roomW,wallH,[0,wallMidY,backZ],[0,0,0],wallMat);
    addPanel(scene,'yakolak-room-left-wall',roomD,wallH,[-halfW,wallMidY,40],[0,Math.PI/2,0],wallMat);
    addPanel(scene,'yakolak-room-right-wall',roomD,wallH,[halfW,wallMidY,40],[0,-Math.PI/2,0],wallMat);

    addLine(scene,'yakolak-room-back-floor-line',[[-halfW,floorY,backZ],[halfW,floorY,backZ]],0xcfc7bb,.82);
    addLine(scene,'yakolak-room-back-ceil-line',[[-halfW,topY,backZ],[halfW,topY,backZ]],0xe3ded5,.55);
    addLine(scene,'yakolak-room-left-corner-line',[[-halfW,floorY,backZ],[-halfW,topY,backZ]],0xd8d2c8,.62);
    addLine(scene,'yakolak-room-right-corner-line',[[halfW,floorY,backZ],[halfW,topY,backZ]],0xd8d2c8,.62);
    addLine(scene,'yakolak-room-left-floor-line',[[-halfW,floorY,backZ],[-halfW,floorY,frontZ]],0xd8d0c4,.46);
    addLine(scene,'yakolak-room-right-floor-line',[[halfW,floorY,backZ],[halfW,floorY,frontZ]],0xd8d0c4,.46);

    console.info('[Yakolak] TRUE GEOMETRY ROOM ACTIVE',{floorY,topY,roomW,roomD,backZ});
  }

  THREE.Scene.prototype.add=function(...objects){
    ensureRoom(this);
    return originalSceneAdd.apply(this,objects);
  };

  THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){
    const s=String(url||'');
    if(s.includes('Asset%201big.svg') || s.includes('Asset 1big.svg')){
      console.info('[Yakolak] legacy SVG background blocked; true geometry room is used instead');
      queueMicrotask(()=>{
        if(onError)onError(new Error('Legacy SVG background disabled. The room is generated with Three.js geometry.'));
      });
      return new THREE.Texture();
    }
    return originalTextureLoad.call(this,url,onLoad,onProgress,onError);
  };
}

installTrueRoomBoot();
import(LIVE_APP + '?b=' + bust);
