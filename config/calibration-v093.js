export const DEFAULT_CALIBRATION = Object.freeze({
  scene: {
    background: '#dce4ea', exposure: 1.16, fog: false, fogColor: '#dfe6eb',
    fogNear: 1800, fogFar: 6200, fov: 45, minDistance: 180, maxDistance: 1350,
    minPolar: 32, maxPolar: 112, markers: false, pixelRatio: 1.4,
    cameraX: 520, cameraY: 430, cameraZ: 520, targetX: 0, targetY: 0, targetZ: 0
  },
  room: {
    floor: {color:'#111820',roughness:.88,metalness:0,opacity:1,emissive:'#05080b',emissiveIntensity:.04,visible:true,wireframe:false},
    ceiling: {color:'#202830',roughness:.94,metalness:0,opacity:1,emissive:'#0a0f14',emissiveIntensity:.05,visible:true,wireframe:false},
    backWall: {color:'#f4f7f9',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    leftWall: {color:'#eef3f6',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    rightWall: {color:'#eef3f6',roughness:.92,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    frontWall: {color:'#ffffff',roughness:.94,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    trim: {color:'#b8c5cf',roughness:.86,metalness:0,opacity:1,emissive:'#000000',emissiveIntensity:0,visible:true,wireframe:false},
    edges: {color:'#71808c',opacity:.68,visible:true},
    grid: {color:'#83909b',opacity:.22,visible:true}
  },
  game: {
    board: {color:'#283039',roughness:.62,metalness:.02,emissive:'#0b1117',emissiveIntensity:.14},
    right: {color:'#ffffff',roughness:.86,metalness:0,emissive:'#000000',emissiveIntensity:0,marble:true},
    left: {color:'#c58b24',roughness:.42,metalness:.22,emissive:'#160d02',emissiveIntensity:.04},
    front: {color:'#08765a',roughness:.5,metalness:.06,emissive:'#001b12',emissiveIntensity:.04},
    back: {color:'#1236a6',roughness:.62,metalness:.02,emissive:'#020a25',emissiveIntensity:.06}
  },
  table: {
    color:'#ffffff',roughness:.82,metalness:0,normalScale:.68,texture:true,
    repeatX:1,repeatY:1,opacity:1,emissive:'#0b0704',emissiveIntensity:.03,wireframe:false
  },
  lights: [
    {id:'orbA',name:'A',type:'point',enabled:true,color:'#ffffff',intensity:2.35,distance:2100,decay:.38,size:30,x:-520,y:420,z:430},
    {id:'orbB',name:'B',type:'point',enabled:true,color:'#fff2cf',intensity:1.65,distance:2000,decay:.4,size:26,x:520,y:360,z:360},
    {id:'orbC',name:'C',type:'point',enabled:true,color:'#d8ecff',intensity:1.2,distance:2000,decay:.42,size:24,x:0,y:820,z:-300},
    {id:'spotKey',name:'مركزة',type:'spot',enabled:false,color:'#fff5dc',intensity:2.6,distance:2400,decay:1.3,angle:28,penumbra:.55,size:28,x:0,y:950,z:520,targetX:0,targetY:0,targetZ:0},
    {id:'lineWash',name:'خطية',type:'linear',enabled:false,color:'#dff3ff',intensity:.42,distance:1600,decay:1.35,count:7,length:1300,axis:'x',size:18,x:0,y:1040,z:-760},
    {id:'rectSoft',name:'مستطيلة',type:'rect',enabled:false,color:'#ffffff',intensity:3,width:900,height:120,size:22,x:0,y:1120,z:-900,rx:-62,ry:0,rz:0},
    {id:'sun',name:'اتجاهية',type:'directional',enabled:true,color:'#fff7e8',intensity:.9,size:24,x:-650,y:900,z:620,targetX:0,targetY:0,targetZ:0},
    {id:'hemi',name:'محيطية',type:'hemisphere',enabled:true,color:'#f5fbff',groundColor:'#35424c',intensity:.55,size:20,x:0,y:1000,z:0},
    {id:'ambient',name:'عامة',type:'ambient',enabled:true,color:'#ffffff',intensity:.16,size:18,x:0,y:850,z:0}
  ],
  play: {
    dragPieces:true,snapToZones:true,showZones:false,zoneSize:36,zoneColor:'#93c5fd',
    zoneOpacity:.28,dropRadius:42,turnSeconds:18,winnerHighlightPreset:'clean',
    winnerBlinkCount:5,winnerBlinkDuration:3000,winnerGlowColor:'#ffffff'
  }
});

export function cloneDefaultCalibration(){
  return JSON.parse(JSON.stringify(DEFAULT_CALIBRATION));
}
