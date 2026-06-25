import * as THREE from 'three';
const N=new Set(['room-floor','room-ceiling','room-back-wall','room-left-wall','room-right-wall','room-front-wall']);
const R=/^(base-|ceiling-)/;
const A=THREE.Object3D.prototype.add;
const P=(m,c,o={})=>{if(!m)return;if(m.color&&m.color.set)m.color.set(c);if(o.t!==undefined)m.transparent=o.t;if(o.o!==undefined)m.opacity=o.o;if(o.d!==undefined)m.depthWrite=o.d;m.needsUpdate=true};
const X=(obj,parent='')=>{if(!obj)return;if(obj.isMesh){const mats=Array.isArray(obj.material)?obj.material:[obj.material];if(N.has(obj.name)){const f=obj.name==='room-front-wall'?{t:true,o:.12,d:false}:{t:false,o:1,d:true};mats.forEach(m=>P(m,0x000000,f));}else if(R.test(obj.name))mats.forEach(m=>P(m,0x111111));}else if(obj.isLine&&parent==='yakolak-soft-empty-room'){P(obj.material,obj.material&&obj.material.opacity<.5?0x1d1d1d:0x2e2e2e,{t:true});}};
THREE.Object3D.prototype.add=function(...objs){objs.forEach(o=>X(o,this.name||''));return A.apply(this,objs)};
