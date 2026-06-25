import * as THREE from 'three';
const darkParts = new Set(['room-floor','room-ceiling']);
const lightParts = new Set(['room-back-wall','room-left-wall','room-right-wall','room-front-wall']);
const oldAdd = THREE.Object3D.prototype.add;
function applyColor(obj){
  if(!obj || !obj.isMesh) return;
  const dark = darkParts.has(obj.name);
  const light = lightParts.has(obj.name);
  if(!dark && !light) return;
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const mat of materials){
    if(!mat) continue;
    if(mat.color && mat.color.set) mat.color.set(dark ? 0x000000 : 0xfafcfd);
    mat.transparent = obj.name === 'room-front-wall';
    mat.opacity = obj.name === 'room-front-wall' ? 0.10 : 1;
    mat.depthWrite = obj.name !== 'room-front-wall';
    mat.needsUpdate = true;
  }
}
THREE.Object3D.prototype.add = function(...items){
  for (const item of items) applyColor(item);
  return oldAdd.apply(this, items);
};
