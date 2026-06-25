import './lights-calib.js?v=73';
import * as THREE from 'three';
const black = new Set(['room-floor','room-ceiling']);
const white = new Set(['room-back-wall','room-left-wall','room-right-wall','room-front-wall']);
const add0 = THREE.Object3D.prototype.add;
function paint(child){
  if(!child) return;
  if(child.traverse) child.traverse(paintOne);
  paintOne(child);
}
function paintOne(child){
  if(!child || !child.isMesh) return;
  const isBlack = black.has(child.name);
  const isWhite = white.has(child.name);
  if(!isBlack && !isWhite) return;
  const list = Array.isArray(child.material) ? child.material : [child.material];
  for (const m of list){
    if(!m) continue;
    if(m.color && m.color.set) m.color.set(isBlack ? 0x000000 : 0xfafcfd);
    m.transparent = child.name === 'room-front-wall';
    m.opacity = child.name === 'room-front-wall' ? .10 : 1;
    m.depthWrite = child.name !== 'room-front-wall';
    m.needsUpdate = true;
  }
}
THREE.Object3D.prototype.add = function(...children){
  for (const child of children) paint(child);
  return add0.apply(this, children);
};
