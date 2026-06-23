// Yakolak boot file.
// Keep the repository root clean for GitHub Pages.
// Live route: index.html -> app.js -> src/app-live.js

const LIVE_APP = './src/app-live.js';
const bust = Date.now();

async function bootYakolak(){
  const res = await fetch(LIVE_APP + '?b=' + bust, {cache:'no-store'});
  let code = await res.text();

  // Runtime visual patch: room shell + visible/effective draggable light spheres.
  code = code
    .replace("...LIGHTING_PRESETS.balanced,shadowBias:-.00008,normalBias:.018,shadowSize:1536,spotAngle:36,spotPenumbra:.48,spotTargetX:0,spotTargetY:0,spotTargetZ:0,", "...LIGHTING_PRESETS.balanced,lampOnly:false,shadowBias:-.00008,normalBias:.018,shadowSize:1536,spotAngle:36,spotPenumbra:.48,spotTargetX:0,spotTargetY:0,spotTargetZ:0,")
    .replace("{enabled:true,label:'لمبة 1',color:'#fff2d0',intensity:.65,distance:360,decay:1.55,pos:[-120,145,115]}", "{enabled:true,label:'لمبة 1',color:'#fff2d0',intensity:2.4,distance:620,decay:1.0,pos:[-105,86,95]}")
    .replace("{enabled:true,label:'لمبة 2',color:'#d8e6ff',intensity:.38,distance:330,decay:1.65,pos:[140,125,-120]}", "{enabled:true,label:'لمبة 2',color:'#d8e6ff',intensity:1.9,distance:580,decay:1.0,pos:[110,86,-95]}")
    .replace("{enabled:true,label:'لمبة 3',color:'#ffffff',intensity:.42,distance:300,decay:1.55,pos:[0,185,20]}", "{enabled:true,label:'لمبة 3',color:'#ffffff',intensity:2.2,distance:600,decay:1.0,pos:[0,118,0]}")
    .replace('const geo=new THREE.SphereGeometry(8,24,16);', `const geo=new THREE.SphereGeometry(24,32,20);
  function makeLampLabel(txt){
    const c=document.createElement('canvas');c.width=128;c.height=128;
    const x=c.getContext('2d');
    x.clearRect(0,0,128,128);x.fillStyle='rgba(0,0,0,.72)';x.beginPath();x.arc(64,64,46,0,Math.PI*2);x.fill();
    x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=6;x.stroke();
    x.fillStyle='#fff';x.font='900 58px system-ui,Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,64,66);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false,transparent:true}));
    sp.scale.set(30,30,1);sp.position.set(0,38,0);sp.renderOrder=10001;sp.frustumCulled=false;
    return sp;
  }`)
    .replace("new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.88,depthTest:true})", "new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:1,depthTest:false,depthWrite:false})")
    .replace("new THREE.SphereGeometry(13,24,16),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.13,depthWrite:false})", "new THREE.SphereGeometry(48,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.34,depthTest:false,depthWrite:false})")
    .replace('const halo=new THREE.Mesh(new THREE.SphereGeometry(48,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.34,depthTest:false,depthWrite:false}));', 'const halo=new THREE.Mesh(new THREE.SphereGeometry(48,32,20),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity:.34,depthTest:false,depthWrite:false}));const label=makeLampLabel(String(i+1));mesh.renderOrder=9999;halo.renderOrder=9998;mesh.frustumCulled=false;halo.frustumCulled=false;light.castShadow=false;')
    .replace('group.add(light,mesh,halo);', 'group.add(light,mesh,halo,label);')
    .replace('movableLamps.push({group,light,mesh,halo});', 'movableLamps.push({group,light,mesh,halo,label});')
    .replace('hemiLight.intensity=l.hemi; keyLight.intensity=l.key; fillLight.intensity=l.fill; rimLight.intensity=l.rim; topLight.intensity=l.top; frontSpot.intensity=l.spot;', 'const lampOnly=!!l.lampOnly;hemiLight.intensity=lampOnly?Math.min(l.hemi,.10):l.hemi; keyLight.intensity=lampOnly?0:l.key; fillLight.intensity=lampOnly?0:l.fill; rimLight.intensity=lampOnly?0:l.rim; topLight.intensity=lampOnly?0:l.top; frontSpot.intensity=lampOnly?0:l.spot;')
    .replace('lamp.light.intensity=cfg.intensity;', 'lamp.light.intensity=cfg.enabled?cfg.intensity:0;')
    .replace('lamp.mesh.material.opacity=cfg.enabled?.88:.22;lamp.halo.material.opacity=cfg.enabled?.13:.04', 'lamp.mesh.material.opacity=cfg.enabled?1:.28;lamp.halo.material.opacity=cfg.enabled?.34:.08')
    .replace("calibrationPanel.appendChild(section('كرات ضوئية قابلة للسحب'));", "calibrationPanel.appendChild(section('كرات ضوئية قابلة للسحب'));calibrationPanel.appendChild(check('لمبات فقط','lighting.lampOnly'));")
    .replace("[['قوة',`lighting.lamps.${i}.intensity`,0,3,.01]", "[['قوة',`lighting.lamps.${i}.intensity`,0,8,.01]")
    .replace("['مدى',`lighting.lamps.${i}.distance`,40,800,1]", "['مدى',`lighting.lamps.${i}.distance`,40,1400,1]")
    .replace("['تلاشي',`lighting.lamps.${i}.decay`,.2,3,.01]", "['تلاشي',`lighting.lamps.${i}.decay`,.1,3,.01]")
    .replace('async function boot(){', `let roomShell=null;
function createRoomShell(){
  if(roomShell)return roomShell;
  roomShell=new THREE.Group();
  roomShell.name='yakolak-room-shell';
  const tableBox=tableMesh?new THREE.Box3().setFromObject(tableMesh):null;
  const floorY=tableBox&&Number.isFinite(tableBox.min.y)?tableBox.min.y-4:-330;
  const ceilingY=Math.max(1120,floorY+900);
  const roomH=ceilingY-floorY;
  const roomW=1500, roomD=1500, halfW=roomW/2, backZ=-650, frontZ=650;
  const floorMat=new THREE.MeshStandardMaterial({color:0xe8e2d6,roughness:.96,metalness:0});
  const wallMat=new THREE.MeshStandardMaterial({color:0xf1eee7,roughness:.98,metalness:0,side:THREE.DoubleSide});
  const ceilMat=new THREE.MeshStandardMaterial({color:0xf7f4ee,roughness:1,metalness:0,side:THREE.DoubleSide});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(0,floorY,0);floor.receiveShadow=true;roomShell.add(floor);
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomD),ceilMat);ceiling.rotation.x=Math.PI/2;ceiling.position.set(0,ceilingY,0);ceiling.receiveShadow=true;roomShell.add(ceiling);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(roomW,roomH),wallMat);back.position.set(0,floorY+roomH/2,backZ);back.receiveShadow=true;roomShell.add(back);
  const left=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);left.rotation.y=Math.PI/2;left.position.set(-halfW,floorY+roomH/2,0);left.receiveShadow=true;roomShell.add(left);
  const right=new THREE.Mesh(new THREE.PlaneGeometry(roomD,roomH),wallMat);right.rotation.y=-Math.PI/2;right.position.set(halfW,floorY+roomH/2,0);right.receiveShadow=true;roomShell.add(right);
  const baseLine=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(roomW,roomH,roomD)),new THREE.LineBasicMaterial({color:0xd5cec2,transparent:true,opacity:.22}));baseLine.position.set(0,floorY+roomH/2,0);roomShell.add(baseLine);
  scene.add(roomShell);
  scene.background=new THREE.Color(0xf1eee7);
  log('room shell created',{floorY,ceilingY,roomW,roomD});
  return roomShell;
}
async function boot(){`)
    .replace('await loadRealTable();', 'await loadRealTable();\n    createRoomShell();');

  const url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
  await import(url);
}

bootYakolak().catch(err=>{
  console.error('[Yakolak] boot failed',err);
  import(LIVE_APP + '?b=' + bust);
});
