const response = await fetch('./src/app-game-v112.js?v=114-online-mobile-foundation-wrapper', { cache: 'no-store' });
if (!response.ok) throw new Error(`v114 wrapper load failed: ${response.status}`);
let wrapper = await response.text();

function replaceExact(oldValue, newValue, label) {
  const count = wrapper.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  wrapper = wrapper.replace(oldValue, newValue);
}

replaceExact(
  "const response=await fetch('./src/app-game-v085.js?v=112-action-tutorial-source',{cache:'no-store'});",
  "const response=await fetch('./src/app-game-v085.js?v=114-online-mobile-foundation-source',{cache:'no-store'});",
  'v114 source marker'
);
replaceExact("const BUILD='112';", "const BUILD='114';", 'v114 build number');

const releasePatch = [
  'replaceRegex(',
  '  /function startTurnTimer\\(\\)\\{.*?\\n\\}\\nasync function runTutorial/s,',
  '  `function startTurnTimer(){',
  '  clearTurnTimer();',
  '  const seconds=Math.max(6,Math.round(+calibration.play.turnSeconds||DEFAULT_TURN_SECONDS));',
  '  const firstGuidedTurn=gameState.firstMoveGuide&&currentPlayer()===gameState.humanColor;',
  '  if(firstGuidedTurn){',
  '    gameState.turnDeadline=0;',
  '    syncScoreHud();',
  '    return;',
  '  }',
  '  gameState.turnDeadline=Date.now()+seconds*1000;',
  '  syncScoreHud();',
  '  timerHandle=setInterval(()=>{',
  '    syncScoreHud();',
  '    if(!gameState.started||gameState.winner||gameState.tutorial||gameState.locked)return;',
  '    if(remainingSeconds()<=0){',
  '      clearTurnTimer();',
  '      const skipped=currentPlayer();',
  "      caption('انتهى وقت '+colorName(skipped)+'. الدور التالي.');",
  '      nextTurn();',
  '    }',
  '  },250);',
  '}',
  'async function runTutorial`,',
  "  'pause only the first guided turn'",
  ');',
  'replaceExact(',
  '  "const turn=gameState.started&&currentPlayer()===c&&!gameState.winner?` · ${remainingSeconds()}ث`:\'\';",',
  '  "const turn=gameState.started&&currentPlayer()===c&&!gameState.winner?(gameState.firstMoveGuide&&c===gameState.humanColor?\' · تعلّم\':` · ${remainingSeconds()}ث`):\'\';",',
  "  'label the untimed guided turn'",
  ');',
  'replaceExact(',
  '  "if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.15);\\n  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.05);\\n  return Math.min(dpr,.9);",',
  '  "if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.3);\\n  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.15);\\n  return Math.min(dpr,1);",',
  "  'sharpen mobile rendering without uncapped DPR'",
  ');',
  'replaceExact(',
  '  "board:{color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2}",',
  '  "board:{color:\'#354958\',roughness:.54,metalness:0,emissive:\'#182832\',emissiveIntensity:.16}",',
  "  'increase board and piece separation'",
  ');',
  'replaceExact(',
  '  "table:{color:\'#aeb2b6\',roughness:.71,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:\'#000000\',emissiveIntensity:0,wireframe:false}",',
  '  "table:{color:\'#766b61\',roughness:.78,metalness:0,normalScale:.1,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:\'#160f0a\',emissiveIntensity:.035,wireframe:false}",',
  "  'replace flat gray table with restrained warm contrast'",
  ');',
  'replaceExact(',
  '  "const baseMat=makeMat({color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2});",',
  '  "const baseMat=makeMat({color:\'#354958\',roughness:.54,metalness:0,emissive:\'#182832\',emissiveIntensity:.16});",',
  "  'match live board material'",
  ');',
  'replaceRegex(',
  '  /function fit\\(objects\\)\\{.*?\\}\\nfunction frame\\(now\\)/s,',
  '  `function setResponsiveOverview(){',
  '  const portrait=innerHeight>innerWidth*1.18;',
  '  const compactLandscape=!portrait&&(innerWidth<=900||innerHeight<=600);',
  '  camera.fov=portrait?49:compactLandscape?45:43;',
  '  if(portrait)camera.position.set(420,670,570);',
  '  else if(compactLandscape)camera.position.set(360,470,430);',
  '  else camera.position.set(520,430,520);',
  '  camera.near=.5;camera.far=12000;',
  '  camera.updateProjectionMatrix();',
  '  controls.target.set(0,portrait?6:0,0);',
  '  controls.minDistance=portrait?560:compactLandscape?430:420;',
  '  controls.maxDistance=portrait?1080:compactLandscape?980:1350;',
  '  controls.update();keepInsideRoom();render();',
  '}',
  'function fit(){setResponsiveOverview()}',
  'function frame(now)`,',
  "  'frame the play surface instead of the table legs'",
  ');',
  'replaceExact(',
  '  "addEventListener(\'resize\',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(performancePixelRatio());renderer.setSize(innerWidth,innerHeight);render()},{passive:true});",',
  '  "addEventListener(\'resize\',()=>{camera.aspect=innerWidth/innerHeight;renderer.setPixelRatio(performancePixelRatio());renderer.setSize(innerWidth,innerHeight);setResponsiveOverview()},{passive:true});",',
  "  'reframe after orientation changes'",
  ');',
  'replaceExact(',
  '  "globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE};",',
  '  "globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE,meshes,render,clearHighlights,showWinHighlight,syncZoneMarkers,setResponsiveOverview};",',
  "  'expose narrow online rendering hooks'",
  ');'
].join('\n');

replaceExact(
  "source+='\\n//# sourceURL=yakolak-v112-action-tutorial-runtime.js\\n';",
  releasePatch + "\nsource+='\\n//# sourceURL=yakolak-v114-online-mobile-foundation-runtime.js\\n';",
  'inject v114 policies'
);
replaceExact(
  "globalThis.__yakolakV112={build:112,base:110,tutorial:'short-skippable-action-led'};",
  "globalThis.__yakolakV114={build:114,base:113,change:'authoritative-online-and-mobile-framing'};",
  'v114 runtime marker'
);

const moduleUrl = URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
  await import('./online-client-v114.js?v=114-online-mobile-foundation-client');
} finally {
  setTimeout(() => URL.revokeObjectURL(moduleUrl), 15000);
}
