import * as THREE from 'three';
console.info('[Yakolak] ROOM BOOT v049 LOADED');
const add0=THREE.Scene.prototype.add;
const load0=THREE.TextureLoader.prototype.load;
function m(c){return new THREE.MeshStandardMaterial({color:c,roughness:1,metalness:0,side:THREE.DoubleSide})}
function p(s,n,w,h,x,y,z,rx,ry,rz,mat){const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);o.name=n;o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.receiveShadow=true;add0.call(s,o)}
function l(s,n,a,b){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);const o=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xd3cdc4,transparent:true,opacity:.65}));o.name=n;add0.call(s,o)}
function room(s){
  if(!s||s.__yakolakRoom)return;
  s.__yakolakRoom=true;s.background=new THREE.Color(0xf6f3ed);
  const fy=-320,ty=455,w=1320,d=1220,hw=w/2,bz=-510,fz=d/2,h=ty-fy,my=fy+h/2;
  p(s,'yakolak-room-floor',w,d,0,fy,40,-Math.PI/2,0,0,m(0xe9e3d8));
  p(s,'yakolak-room-ceiling',w,d,0,ty,40,Math.PI/2,0,0,m(0xfffdf8));
  p(s,'yakolak-room-back-wall',w,h,0,my,bz,0,0,0,m(0xf6f3ed));
  p(s,'yakolak-room-left-wall',d,h,-hw,my,40,0,Math.PI/2,0,m(0xf6f3ed));
  p(s,'yakolak-room-right-wall',d,h,hw,my,40,0,-Math.PI/2,0,m(0xf6f3ed));
  l(s,'yakolak-room-back-floor-line',[-hw,fy,bz],[hw,fy,bz]);
  l(s,'yakolak-room-left-corner-line',[-hw,fy,bz],[-hw,ty,bz]);
  l(s,'yakolak-room-right-corner-line',[hw,fy,bz],[hw,ty,bz]);
  l(s,'yakolak-room-left-floor-line',[-hw,fy,bz],[-hw,fy,fz]);
  l(s,'yakolak-room-right-floor-line',[hw,fy,bz],[hw,fy,fz]);
  console.info('[Yakolak] TRUE GEOMETRY ROOM ACTIVE',{fy,ty,w,d,bz});
}
THREE.Scene.prototype.add=function(...o){room(this);return add0.apply(this,o)};
THREE.TextureLoader.prototype.load=function(u,onLoad,onProgress,onError){
  const s=String(u||'');
  if(s.includes('Asset%201big.svg')||s.includes('Asset 1big.svg')){
    console.info('[Yakolak] SVG background skipped; true room active');
    queueMicrotask(()=>onError&&onError(new Error('svg background disabled')));
    return new THREE.Texture();
  }
  return load0.call(this,u,onLoad,onProgress,onError);
};
import('./app.js?boot='+Date.now()+'&room=49');
