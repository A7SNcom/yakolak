export const DEFAULT_CALIBRATION = Object.freeze({
  scene: {
    background: '#e9eef2', exposure: 1.03, fog: false, fogColor: '#dfe6eb',
    fogNear: 1800, fogFar: 6200, fov: 45, minDistance: 180, maxDistance: 1350,
    minPolar: 32, maxPolar: 112, markers: false, pixelRatio: 1.25,
    cameraX: 520, cameraY: 430, cameraZ: 520, targetX: 0, targetY: 0, targetZ: 0
  },
  room: {
    floor: {color:'#000000',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    ceiling: {color:'#000000',roughness:.96,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    backWall: {color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall: {color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall: {color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall: {color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim: {color:'#d2dbe1',roughness:.9,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges: {color:'#9eacb5',opacity:.84,visible:true},
    grid: {color:'#c9d3da',opacity:.3,visible:true}
  },
  game: {
    board: {color:'#161616',roughness:.54,metalness:.04,emissive:'#000000',emissiveIntensity:0},
    right: {color:'#ffffff',roughness:.92,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:true},
    left: {color:'#b37a18',roughness:.48,metalness:.28,emissive:'#000000',emissiveIntensity:0},
    front: {color:'#006144',roughness:.58,metalness:.08,emissive:'#000000',emissiveIntensity:0},
    back: {color:'#001f8f',roughness:.74,metalness:0,emissive:'#000000',emissiveIntensity:0}
  },
  table: {
    color:'#000000',roughness:.92,metalness:0,normalScale:.75,texture:true,
    repeatX:1,repeatY:1,opacity:1,emissive:'#000000',emissiveIntensity:0,wireframe:false
  },
  lights: [
    {id:'orbA',name:'A',type:'point',enabled:true,color:'#ffffff',intensity:2.7,distance:2300,decay:.25,size:30,x:-520,y:380,z:430},
    {id:'orbB',name:'B',type:'point',enabled:true,color:'#fff2cf',intensity:1.9,distance:2200,decay:.25,size:26,x:520,y:300,z:360},
    {id:'orbC',name:'C',type:'point',enabled:true,color:'#d8ecff',intensity:1.45,distance:2200,decay:.25,size:24,x:0,y:850,z:-360},
    {id:'spotKey',name:'مركزة',type:'spot',enabled:false,color:'#fff5dc',intensity:2.6,distance:2400,decay:1.3,angle:28,penumbra:.55,size:28,x:0,y:950,z:520,targetX:0,targetY:0,targetZ:0},
    {id:'lineWash',name:'خطية',type:'linear',enabled:false,color:'#dff3ff',intensity:.42,distance:1600,decay:1.35,count:7,length:1300,axis:'x',size:18,x:0,y:1040,z:-760},
    {id:'rectSoft',name:'مستطيلة',type:'rect',enabled:false,color:'#ffffff',intensity:3,width:900,height:120,size:22,x:0,y:1120,z:-900,rx:-62,ry:0,rz:0},
    {id:'sun',name:'اتجاهية',type:'directional',enabled:false,color:'#ffffff',intensity:1.2,size:24,x:-650,y:900,z:620,targetX:0,targetY:0,targetZ:0},
    {id:'hemi',name:'محيطية',type:'hemisphere',enabled:false,color:'#ffffff',groundColor:'#cbd8df',intensity:.45,size:20,x:0,y:1000,z:0},
    {id:'ambient',name:'عامة',type:'ambient',enabled:false,color:'#ffffff',intensity:.24,size:18,x:0,y:850,z:0}
  ],
  play: {
    dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#60a5fa',
    zoneOpacity:.22,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',
    winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'
  }
});

export function cloneDefaultCalibration(){
  return JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
}
