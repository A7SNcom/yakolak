import * as THREE from 'three';
const oldAdd=THREE.Object3D.prototype.add;
let scene,ready=false,rig,items=[];
const key='yakolak_lights';
const def=[['A','#ffffff',1.8,1800,1.4,30,-520,380,430],['B','#fff2cf',1.1,1600,1.5,26,520,300,360],['C','#d8ecff',.9,1500,1.4,24,0,850,-360]];
const get=()=>{try{return JSON.parse(localStorage.getItem(key))||def}catch(e){return def}};
const set=v=>{try{localStorage.setItem(key,JSON.stringify(v))}catch(e){}};
const repaint=()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
function build(){
 if(!scene||rig)return; const data=get();
 rig=new THREE.Group(); rig.name='yakolak-orb-light-rig';
 items=data.map(d=>{const m=new THREE.Mesh(new THREE.SphereGeometry(24,24,16),new THREE.MeshBasicMaterial({color:d[1]}));const l=new THREE.PointLight(d[1],d[2],d[3],d[4]);l.userData.orbLight=true;oldAdd.call(rig,m);oldAdd.call(rig,l);return {m,l}});
 oldAdd.call(scene,rig); ui(data); apply(data); repaint();
}
function apply(data){items.forEach((r,i)=>{const d=data[i],on=d[2]>0,c=new THREE.Color(d[1]);r.m.visible=on;r.l.visible=on;r.m.material.color.copy(c);r.l.color.copy(c);r.l.intensity=+d[2];r.l.distance=+d[3];r.l.decay=+d[4];r.m.scale.setScalar(+d[5]/24);r.m.position.set(+d[6],+d[7],+d[8]);r.l.position.copy(r.m.position)})}
function ui(data){const p=document.createElement('div');p.id='gptLightPanel';p.style.cssText='position:fixed;right:12px;top:12px;z-index:10001;width:260px;max-height:88vh;overflow:auto;background:#111;color:#fff;border:1px solid #555;border-radius:12px;padding:10px;font:12px system-ui;direction:rtl';p.innerHTML='<b>معايرة كور الإضاءة</b><br><small>الإضاءات الأصلية مغلقة</small>';const names=['','اللون','القوة','المدى','الخفوت','الحجم','يمين','ارتفاع','عمق'];data.forEach((d,i)=>{const box=document.createElement('div');box.style.cssText='border-top:1px solid #333;margin-top:8px;padding-top:8px';box.innerHTML='<b>كورة '+d[0]+'</b>';for(let k=1;k<d.length;k++){const lab=document.createElement('label');lab.style.cssText='display:grid;grid-template-columns:55px 1fr 42px;gap:5px;margin:5px 0;align-items:center';const inp=document.createElement('input');inp.type=k==1?'color':'range';if(k>1){let ranges=[[0,8,.05],[100,5000,50],[0,3,.05],[8,90,1],[-1500,1500,10],[-650,1400,10],[-1500,1500,10]][k-2];inp.min=ranges[0];inp.max=ranges[1];inp.step=ranges[2]}inp.value=d[k];const out=document.createElement('span');out.textContent=d[k];inp.oninput=()=>{d[k]=k==1?inp.value:+inp.value;out.textContent=d[k];apply(data);set(data);repaint()};lab.append(names[k],inp,out);box.appendChild(lab)}p.appendChild(box)});const b=document.createElement('button');b.textContent='افتراضي';b.onclick=()=>{localStorage.removeItem(key);location.reload()};p.appendChild(b);document.body.appendChild(p)}
THREE.Object3D.prototype.add=function(...a){if(this.isScene){scene=this;if(!ready){ready=true;setTimeout(build,120)}}a.forEach(o=>{if(o?.isLight&&!o.userData?.orbLight){o.intensity=0;o.visible=false}});return oldAdd.apply(this,a)};
