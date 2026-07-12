from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


app_path = Path('src/app-game-v085.js')
app = app_path.read_text(encoding='utf-8-sig')

app = replace_once(app, "const BUILD='92';", "const BUILD='93';", 'game build')
app = replace_once(
    app,
    "scene:{background:'#e9eef2',exposure:1.03,fog:false,fogColor:'#dfe6eb',fogNear:1800,fogFar:6200,fov:45,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.25,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},",
    "scene:{background:'#dce4ea',exposure:1.16,fog:false,fogColor:'#d9e2e8',fogNear:1800,fogFar:6200,fov:45,minDistance:180,maxDistance:1350,minPolar:32,maxPolar:112,markers:false,pixelRatio:1.4,cameraX:520,cameraY:430,cameraZ:520,targetX:0,targetY:0,targetZ:0},",
    'scene defaults',
)
for old, new, label in [
    ("floor:{color:'#000000',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "floor:{color:'#111820',roughness:.88,metalness:0,opacity:1,emissive:'#05080b',emissiveIntensity:.04,visible:true,wireframe:false}", 'floor'),
    ("ceiling:{color:'#000000',roughness:.96,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "ceiling:{color:'#202830',roughness:.94,metalness:0,opacity:1,emissive:'#0a0f14',emissiveIntensity:.05,visible:true,wireframe:false}", 'ceiling'),
    ("backWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "backWall:{color:'#f4f7f9',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", 'back wall'),
    ("leftWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "leftWall:{color:'#eef3f6',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", 'left wall'),
    ("rightWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "rightWall:{color:'#eef3f6',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", 'right wall'),
    ("frontWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "frontWall:{color:'#ffffff',roughness:.94,metalness:0,opacity:.08,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", 'front wall'),
    ("trim:{color:'#d2dbe1',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", "trim:{color:'#b8c5cf',roughness:.86,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false}", 'trim'),
    ("edges:{color:'#9eacb5',opacity:.84,visible:true}", "edges:{color:'#71808c',opacity:.68,visible:true}", 'edges'),
    ("grid:{color:'#c9d3da',opacity:.3,visible:true}", "grid:{color:'#83909b',opacity:.22,visible:true}", 'grid'),
    ("board:{color:'#161616',roughness:.54,metalness:.04,emissive:'#000000',emissiveIntensity:0}", "board:{color:'#283039',roughness:.62,metalness:.02,emissive:'#0b1117',emissiveIntensity:.14}", 'board'),
    ("right:{color:'#ffffff',roughness:.92,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:true}", "right:{color:'#ffffff',roughness:.86,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:true}", 'white pieces'),
    ("left:{color:'#b37a18',roughness:.48,metalness:.28,emissive:'#000000',emissiveIntensity:0}", "left:{color:'#c58b24',roughness:.42,metalness:.22,emissive:'#160d02',emissiveIntensity:.04}", 'gold pieces'),
    ("front:{color:'#006144',roughness:.58,metalness:.08,emissive:'#000000',emissiveIntensity:0}", "front:{color:'#08765a',roughness:.5,metalness:.06,emissive:'#001b12',emissiveIntensity:.04}", 'green pieces'),
    ("back:{color:'#001f8f',roughness:.74,metalness:0,emissive:'#000000',emissiveIntensity:0}", "back:{color:'#1236a6',roughness:.62,metalness:.02,emissive:'#020a25',emissiveIntensity:.06}", 'blue pieces'),
    ("table:{color:'#ffffff',roughness:.92,metalness:0,normalScale:.75,texture:true,repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false}", "table:{color:'#ffffff',roughness:.82,metalness:0,normalScale:.68,texture:true,repeatX:1,repeatY:1,opacity:1,emissive:'#0b0704',emissiveIntensity:.03,wireframe:false}", 'table'),
]:
    app = replace_once(app, old, new, label)

for old, new, label in [
    ("{id:'orbA',name:'A',type:'point',enabled:true,color:'#ffffff',intensity:2.7,distance:2300,decay:.25,size:30,x:-520,y:380,z:430}", "{id:'orbA',name:'A',type:'point',enabled:true,color:'#fffdf5',intensity:2.35,distance:2100,decay:.38,size:30,x:-520,y:420,z:430}", 'orb A'),
    ("{id:'orbB',name:'B',type:'point',enabled:true,color:'#fff2cf',intensity:1.9,distance:2200,decay:.25,size:26,x:520,y:300,z:360}", "{id:'orbB',name:'B',type:'point',enabled:true,color:'#ffe8bd',intensity:1.65,distance:2000,decay:.4,size:26,x:520,y:360,z:360}", 'orb B'),
    ("{id:'orbC',name:'C',type:'point',enabled:true,color:'#d8ecff',intensity:1.45,distance:2200,decay:.25,size:24,x:0,y:850,z:-360}", "{id:'orbC',name:'C',type:'point',enabled:true,color:'#d7ebff',intensity:1.2,distance:2000,decay:.42,size:24,x:0,y:820,z:-300}", 'orb C'),
    ("{id:'sun',name:'اتجاهية',type:'directional',enabled:false,color:'#ffffff',intensity:1.2,size:24,x:-650,y:900,z:620,targetX:0,targetY:0,targetZ:0}", "{id:'sun',name:'اتجاهية',type:'directional',enabled:true,color:'#fff7e8',intensity:.9,size:24,x:-650,y:900,z:620,targetX:0,targetY:0,targetZ:0}", 'sun'),
    ("{id:'hemi',name:'محيطية',type:'hemisphere',enabled:false,color:'#ffffff',groundColor:'#cbd8df',intensity:.45,size:20,x:0,y:1000,z:0}", "{id:'hemi',name:'محيطية',type:'hemisphere',enabled:true,color:'#f5fbff',groundColor:'#35424c',intensity:.55,size:20,x:0,y:1000,z:0}", 'hemisphere'),
    ("{id:'ambient',name:'عامة',type:'ambient',enabled:false,color:'#ffffff',intensity:.24,size:18,x:0,y:850,z:0}", "{id:'ambient',name:'عامة',type:'ambient',enabled:true,color:'#ffffff',intensity:.16,size:18,x:0,y:850,z:0}", 'ambient'),
    ("play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#60a5fa',zoneOpacity:.22,dropRadius:42", "play:{dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#93c5fd',zoneOpacity:.28,dropRadius:42", 'zone defaults'),
]:
    app = replace_once(app, old, new, label)

app = replace_once(app, "const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});", "const renderer=new THREE.WebGLRenderer({antialias:innerWidth>640,alpha:false,powerPreference:'high-performance'});", 'renderer antialias')
app = replace_once(app, "renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio||1,1),1.25));", "const effectivePixelRatio=()=>Math.min(Math.max(devicePixelRatio||1,1),innerWidth<=640?1.35:1.6);\nrenderer.setPixelRatio(effectivePixelRatio());", 'initial pixel ratio')
app = replace_once(app, "root.appendChild(renderer.domElement);", "root.appendChild(renderer.domElement);\nrenderer.domElement.style.touchAction='none';", 'touch action')
app = replace_once(app, "controls.enablePan=false;", "controls.enablePan=false;\ncontrols.rotateSpeed=.68;\ncontrols.zoomSpeed=.82;", 'orbit tuning')
app = replace_once(app, "renderer.setPixelRatio(Math.min(Math.max(+calibration.scene.pixelRatio||1,1),2));", "renderer.setPixelRatio(Math.min(Math.max(+calibration.scene.pixelRatio||1,1),innerWidth<=640?1.35:1.6));", 'calibration pixel ratio')
app = replace_once(app, "const baseMat=makeMat({color:'#161616',roughness:.54,metalness:.04});", "const baseMat=makeMat({color:'#283039',roughness:.62,metalness:.02,emissive:'#0b1117',emissiveIntensity:.14});", 'base material')
app = replace_once(app, "const mats={right:makeMat({color:'#fff',roughness:.92,metalness:0}),left:makeMat({color:'#b37a18',roughness:.48,metalness:.28}),front:makeMat({color:'#006144',roughness:.58,metalness:.08}),back:makeMat({color:'#001f8f',roughness:.74,metalness:0})};", "const mats={right:makeMat({color:'#fff',roughness:.86,metalness:0}),left:makeMat({color:'#c58b24',roughness:.42,metalness:.22}),front:makeMat({color:'#08765a',roughness:.5,metalness:.06}),back:makeMat({color:'#1236a6',roughness:.62,metalness:.02})};", 'piece materials')
app = replace_once(app, "right:{label:'الأبيض',short:'أبيض',css:'#f4f4f0',power:.74},\n  back:{label:'الأزرق',short:'أزرق',css:'#001f8f',power:.88},\n  left:{label:'الذهبي',short:'ذهبي',css:'#b37a18',power:.66},\n  front:{label:'الأخضر',short:'أخضر',css:'#006144',power:.8}", "right:{label:'الأبيض',short:'أبيض',css:'#f7f7f2',power:.74},\n  back:{label:'الأزرق',short:'أزرق',css:'#1236a6',power:.88},\n  left:{label:'الذهبي',short:'ذهبي',css:'#c58b24',power:.66},\n  front:{label:'الأخضر',short:'أخضر',css:'#08765a',power:.8}", 'color info')

old_sync = """function syncZoneMarkers(force=false){
  const visible=force||calibration.play.showZones;
  zoneMarkers.forEach((m,i)=>{
    const busy=gameState.board[i]&&SIZE_TYPES.some(size=>gameState.board[i][size]);
    m.visible=visible;
    m.material.color.set(busy?0xf59e0b:calibration.play.zoneColor);
    m.material.transparent=false;
    m.material.opacity=1;
    m.scale.setScalar(Math.max(8,+calibration.play.zoneSize)/36);
  });
}"""
new_sync = """function syncZoneMarkers(force=false){
  const active=force||calibration.play.showZones||!!selectedPlayPiece;
  const idle=gameState.configured&&!gameState.winner;
  zoneMarkers.forEach((m,i)=>{
    const busy=gameState.board[i]&&SIZE_TYPES.some(size=>gameState.board[i][size]);
    m.visible=active||idle;
    const activeColor=COLOR_INFO[selectedPlayPiece?.dir]?.css||calibration.play.zoneColor;
    m.material.color.set(busy?0xf59e0b:active?activeColor:0x94a3b8);
    m.material.transparent=true;
    m.material.opacity=busy?.32:active?.9:(+calibration.play.zoneOpacity||.28);
    m.scale.setScalar(active?Math.max(8,+calibration.play.zoneSize)/36:.92);
  });
}"""
app = replace_once(app, old_sync, new_sync, 'zone visibility')
app = replace_once(app, "const mat=new THREE.MeshBasicMaterial({color:calibration.play.zoneColor,side:THREE.DoubleSide,depthTest:false,depthWrite:false});", "const mat=new THREE.MeshBasicMaterial({color:calibration.play.zoneColor,side:THREE.DoubleSide,transparent:true,opacity:.28,depthTest:true,depthWrite:false});", 'zone material')
app = replace_once(app, "m.position.set(z.px,z.py,z.pz);", "m.position.set(z.px,z.py+.8,z.pz);", 'zone lift')
app = replace_once(app, "m.renderOrder=10001;", "m.renderOrder=120;", 'zone render order')
app = replace_once(app, "m.material.transparent=false;\n    m.material.opacity=1;\n    m.scale.setScalar(1.04);", "m.material.transparent=true;\n    m.material.opacity=.92;\n    m.scale.setScalar(1.04);", 'playable zones')

old_mobile = "@media (max-width:640px){.yg-card{padding:14px}.yg-title{font-size:21px}.yg-colors{grid-template-columns:repeat(2,1fr)}.yg-bots{grid-template-columns:1fr}.yg-choice{min-height:104px}.yg-caption{min-height:46px;padding:10px 12px;font-size:14px}.yg-score{top:54px;left:8px;right:8px;flex-wrap:wrap}.yg-score span{min-width:48px;padding:6px}.yt-text{font-size:16px}}`"
new_mobile = """@media (max-width:640px){
    .yg-card{padding:14px}.yg-title{font-size:21px}.yg-colors{grid-template-columns:repeat(2,1fr)}.yg-bots{grid-template-columns:1fr}.yg-choice{min-height:104px}
    .yg-caption{min-height:52px;padding:10px 10px 9px;font-size:16px;line-height:1.45}
    .yg-score{top:60px;left:6px;right:6px;gap:4px;flex-wrap:nowrap;justify-content:center;overflow-x:auto;padding:2px 0;scrollbar-width:none}
    .yg-score::-webkit-scrollbar{display:none}
    .yg-score span{min-width:0;flex:0 0 auto;white-space:nowrap;padding:6px 7px;font-size:11px;border-radius:9px}
    #yakolakTools{right:50%;transform:translateX(50%);bottom:max(8px,env(safe-area-inset-bottom));gap:6px}
    .yakolak-tool,#clearCacheBtn.yakolak-tool{width:48px!important;height:44px!important;font-size:11px!important}
    .yt-box{padding:18px 14px}.yt-text{font-size:17px}.yt-actions button{height:48px;font-size:14px}
  }`"""
app = replace_once(app, old_mobile, new_mobile, 'mobile css')
app = replace_once(app, "function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();keepInsideRoom()}", "function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),maxDim=Math.max(s.x,s.y,s.z)||260,portrait=innerHeight>innerWidth*1.35,dist=maxDim*(portrait?2.05:1.65);camera.position.set(dist*(portrait?.78:1),dist*(portrait?.92:.82),dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,portrait?22:0,0);controls.update();keepInsideRoom()}", 'responsive fit')
app = replace_once(app, "log('game v091 ready - svg table footprint')", "log('game v093 ready - brighter board and mobile framing')", 'ready log')
app_path.write_text(app, encoding='utf-8')

# Create the v093 server fallback from the recovered v092 configuration.
old_cfg = Path('config/calibration-v092.js')
cfg = old_cfg.read_text(encoding='utf-8')
replacements = {
    "background: '#e9eef2', exposure: 1.03": "background: '#dce4ea', exposure: 1.16",
    "pixelRatio: 1.25": "pixelRatio: 1.4",
    "floor: {color:'#000000',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0": "floor: {color:'#111820',roughness:.88,metalness:0,opacity:1,emissive:'#05080b',emissiveIntensity:.04",
    "ceiling: {color:'#000000',roughness:.96,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0": "ceiling: {color:'#202830',roughness:.94,metalness:0,opacity:1,emissive:'#0a0f14',emissiveIntensity:.05",
    "backWall: {color:'#ffffff',roughness:.94": "backWall: {color:'#f4f7f9',roughness:.92",
    "leftWall: {color:'#ffffff',roughness:.94": "leftWall: {color:'#eef3f6',roughness:.92",
    "rightWall: {color:'#ffffff',roughness:.94": "rightWall: {color:'#eef3f6',roughness:.92",
    "trim: {color:'#d2dbe1',roughness:.9": "trim: {color:'#b8c5cf',roughness:.86",
    "edges: {color:'#9eacb5',opacity:.84": "edges: {color:'#71808c',opacity:.68",
    "grid: {color:'#c9d3da',opacity:.3": "grid: {color:'#83909b',opacity:.22",
    "board: {color:'#161616',roughness:.54,metalness:.04,emissive:'#000000',emissiveIntensity:0}": "board: {color:'#283039',roughness:.62,metalness:.02,emissive:'#0b1117',emissiveIntensity:.14}",
    "right: {color:'#ffffff',roughness:.92": "right: {color:'#ffffff',roughness:.86",
    "left: {color:'#b37a18',roughness:.48,metalness:.28,emissive:'#000000',emissiveIntensity:0}": "left: {color:'#c58b24',roughness:.42,metalness:.22,emissive:'#160d02',emissiveIntensity:.04}",
    "front: {color:'#006144',roughness:.58,metalness:.08,emissive:'#000000',emissiveIntensity:0}": "front: {color:'#08765a',roughness:.5,metalness:.06,emissive:'#001b12',emissiveIntensity:.04}",
    "back: {color:'#001f8f',roughness:.74,metalness:0,emissive:'#000000',emissiveIntensity:0}": "back: {color:'#1236a6',roughness:.62,metalness:.02,emissive:'#020a25',emissiveIntensity:.06}",
    "color:'#000000',roughness:.92,metalness:0,normalScale:.75": "color:'#ffffff',roughness:.82,metalness:0,normalScale:.68",
    "emissive:'#000000',emissiveIntensity:0,wireframe:false\n  },\n  lights": "emissive:'#0b0704',emissiveIntensity:.03,wireframe:false\n  },\n  lights",
    "intensity:2.7,distance:2300,decay:.25,size:30,x:-520,y:380": "intensity:2.35,distance:2100,decay:.38,size:30,x:-520,y:420",
    "intensity:1.9,distance:2200,decay:.25,size:26,x:520,y:300": "intensity:1.65,distance:2000,decay:.4,size:26,x:520,y:360",
    "intensity:1.45,distance:2200,decay:.25,size:24,x:0,y:850,z:-360": "intensity:1.2,distance:2000,decay:.42,size:24,x:0,y:820,z:-300",
    "type:'directional',enabled:false,color:'#ffffff',intensity:1.2": "type:'directional',enabled:true,color:'#fff7e8',intensity:.9",
    "type:'hemisphere',enabled:false,color:'#ffffff',groundColor:'#cbd8df',intensity:.45": "type:'hemisphere',enabled:true,color:'#f5fbff',groundColor:'#35424c',intensity:.55",
    "type:'ambient',enabled:false,color:'#ffffff',intensity:.24": "type:'ambient',enabled:true,color:'#ffffff',intensity:.16",
    "zoneColor:'#60a5fa',\n    zoneOpacity:.22": "zoneColor:'#93c5fd',\n    zoneOpacity:.28",
}
for old, new in replacements.items():
    if old not in cfg:
        raise SystemExit(f'config replacement missing: {old}')
    cfg = cfg.replace(old, new, 1)
new_cfg = Path('config/calibration-v093.js')
new_cfg.write_text(cfg, encoding='utf-8')
old_cfg.unlink()

api_path = Path('api/calibration.js')
api = api_path.read_text(encoding='utf-8')
api = replace_once(api, "../config/calibration-v092.js", "../config/calibration-v093.js", 'api config import')
api = replace_once(api, "build: 92,", "build: 93,", 'api fallback build')
api = replace_once(api, "yakolak v092 recovered calibration fallback", "yakolak v093 visual mobile calibration fallback", 'api fallback note')
api = replace_once(api, ": 92;", ": 93;", 'api default build')
api_path.write_text(api, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
index = replace_once(index, 'v092-calibration-tutorial-fixes', 'v093-visual-mobile-clarity', 'index meta')
index = replace_once(index, "const BUILD='92';", "const BUILD='93';", 'index build')
index = replace_once(index, 'background:#0b0b0b;color:#fff', 'background:#111820;color:#fff;overscroll-behavior:none', 'page background')
index_path.write_text(index, encoding='utf-8')

entry_path = Path('app.js')
entry = entry_path.read_text(encoding='utf-8')
entry = replace_once(entry, "APP.JS v092 CALIBRATION TUTORIAL FIXES LOADED", "APP.JS v093 VISUAL MOBILE CLARITY LOADED", 'entry log')
entry = replace_once(entry, "const BUILD='92';", "const BUILD='93';", 'entry build')
entry_path.write_text(entry, encoding='utf-8')

version = {
    'version': 'v093-visual-mobile-clarity',
    'build': 93,
    'updated_at': '2026-07-12',
    'note': 'Improves room lighting, restores the natural table texture, increases board and piece contrast, adds subtle playable-cell guides, and refines portrait mobile framing and controls without changing game rules.'
}
Path('version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Guardrails: gameplay constants and rules must remain unchanged.
assert "const D=48,R3=135" in app
assert "const DEFAULT_TURN_SECONDS=18" in app
assert "const WIN_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]" in app
assert "const SIZE_TYPES=['s','m','l']" in app
print('v093 visual/mobile changes prepared successfully')
