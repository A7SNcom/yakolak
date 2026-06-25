import * as THREE from 'three';
const targets = new Set(['room-floor','room-ceiling']);
const add0 = THREE.Object3D.prototype.add;
function colorize(child){
  if(!child || !child.isMesh) return;
  if(!targets.has(child.name)) return;
  const list = Array.isArray(child.material) ? child.material : [child.material];
  for (const m of list){
    if(!m) continue;
    if(m.color && m.color.set) m.color.set(0x000000);
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
    m.needsUpdate = true;
  }
}
THREE.Object3D.prototype.add = function(...children){
  for (const child of children) colorize(child);
  return add0.apply(this, children);
};
