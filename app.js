// Yakolak boot file.
// Keep the repository root clean for GitHub Pages.
// Live route: index.html -> app.js -> src/app-live.js

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

async function bootYakolak(){
  const res = await fetch(LIVE_APP + '?b=' + bust, {cache:'no-store'});
  let code = await res.text();

  // Runtime visual patch: make draggable light spheres obvious and easy to grab.
  code = code
    .replace("{enabled:true,label:'لمبة 1',color:'#fff2d0',intensity:.65,distance:360,decay:1.55,pos:[-120,145,115]}", "{enabled:true,label:'لمبة 1',color:'#fff2d0',intensity:.85,distance:420,decay:1.35,pos:[-105,78,95]}")
    .replace("{enabled:true,label:'لمبة 2',color:'#d8e6ff',intensity:.38,distance:330,decay:1.65,pos:[140,125,-120]}", "{enabled:true,label:'لمبة 2',color:'#d8e6ff',intensity:.62,distance:390,decay:1.40,pos:[110,78,-95]}")
    .replace("{enabled:true,label:'لمبة 3',color:'#ffffff',intensity:.42,distance:300,decay:1.55,pos:[0,185,20]}", "{enabled:true,label:'لمبة 3',color:'#ffffff',intensity:.70,distance:380,decay:1.35,pos:[0,92,0]}")
    .replace('const geo=new THREE.SphereGeometry(8,24,16);', 'const geo=new THREE.SphereGeometry(22,32,20);')
    .replace("new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.88,depthTest:true})", "new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:1,depthTest:false,depthWrite:false})")
    .replace("new THREE.SphereGeometry(13,24,16),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.13,depthWrite:false})", "new THREE.SphereGeometry(40,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.28,depthTest:false,depthWrite:false})")
    .replace('const halo=new THREE.Mesh(new THREE.SphereGeometry(40,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.28,depthTest:false,depthWrite:false}));', 'const halo=new THREE.Mesh(new THREE.SphereGeometry(40,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.28,depthTest:false,depthWrite:false}));mesh.renderOrder=9999;halo.renderOrder=9998;mesh.frustumCulled=false;halo.frustumCulled=false;')
    .replace('lamp.mesh.material.opacity=cfg.enabled?.88:.22;lamp.halo.material.opacity=cfg.enabled?.13:.04', 'lamp.mesh.material.opacity=cfg.enabled?1:.28;lamp.halo.material.opacity=cfg.enabled?.28:.08');

  const url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
  await import(url);
}

bootYakolak().catch(err=>{
  console.error('[Yakolak] boot failed',err);
  import(LIVE_APP + '?b=' + bust);
});
