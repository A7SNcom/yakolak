const response = await fetch('./src/app-game-v112.js?v=120-mobile-board-separation-wrapper', { cache: 'no-store' });
if (!response.ok) throw new Error(`v120 wrapper load failed: ${response.status}`);
let wrapper = await response.text();

function replaceExact(oldValue, newValue, label) {
  const count = wrapper.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  wrapper = wrapper.replace(oldValue, newValue);
}

replaceExact(
  "const response=await fetch('./src/app-game-v085.js?v=112-action-tutorial-source',{cache:'no-store'});",
  "const response=await fetch('./src/app-game-v085.js?v=120-mobile-board-separation-source',{cache:'no-store'});",
  'v120 source marker'
);
replaceExact("const BUILD='112';", "const BUILD='120';", 'v120 build number');

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
  '  "if(MOBILE_HIGH_QUALITY)return Math.min(dpr,1.5);\\n  if(DEVICE_MEMORY>=4||CPU_CORES>=6)return Math.min(dpr,1.35);\\n  return Math.min(dpr,1.15);",',
  "  'raise bounded mobile clarity for simple board geometry'",
  ');',
  'replaceExact(',
  '  "board:{color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2}",',
  '  "board:{color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2}",',
  "  'restore the established board material'",
  ');',
  'replaceExact(',
  '  "table:{color:\'#aeb2b6\',roughness:.71,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:\'#000000\',emissiveIntensity:0,wireframe:false}",',
  '  "table:{color:\'#aeb2b6\',roughness:.71,metalness:0,normalScale:.12,texture:false,repeatX:1,repeatY:1,opacity:1,emissive:\'#000000\',emissiveIntensity:0,wireframe:false}",',
  "  'restore the established neutral table'",
  ');',
  'replaceExact(',
  '  "const baseMat=makeMat({color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2});",',
  '  "const baseMat=makeMat({color:\'#4a5562\',roughness:.48,metalness:0,emissive:\'#25313d\',emissiveIntensity:.2});",',
  "  'restore the established live board material'",
  ');',
  'replaceExact(',
  '  "function applyGameMaterials(){\\n  const game=calibration.game;",',
  '  "function applyGameMaterials(){\\n  const game=calibration.game;\\n  const board=globalThis.__yakolakMobileClarityV120?.boardStyleFor?.(game.board,MOBILE_VIEW)||game.board;",',
  "  'resolve mobile-only board separation'",
  ');',
  'replaceExact(',
  '  "baseMat.color.set(game.board.color);baseMat.roughness=+game.board.roughness;baseMat.metalness=+game.board.metalness;\\n  if(baseMat.emissive&&game.board.emissive)baseMat.emissive.set(game.board.emissive);\\n  if(\'emissiveIntensity\' in baseMat)baseMat.emissiveIntensity=+game.board.emissiveIntensity||0;",',
  '  "baseMat.color.set(board.color);baseMat.roughness=+board.roughness;baseMat.metalness=+board.metalness;\\n  if(baseMat.emissive&&board.emissive)baseMat.emissive.set(board.emissive);\\n  if(\'emissiveIntensity\' in baseMat)baseMat.emissiveIntensity=+board.emissiveIntensity||0;",',
  "  'apply mobile board style without extra render work'",
  ');',
  'replaceRegex(',
  '  /function fit\\(objects\\)\\{.*?\\}\\nfunction frame\\(now\\)/s,',
  '  `function setPlayerView(color=gameState.humanColor){',
  '  const portrait=innerHeight>innerWidth*1.18;',
  '  const compactLandscape=!portrait&&(innerWidth<=900||innerHeight<=600);',
  '  const crowded=(gameState.players?.length||2)>2;',
  '  const valid=TURN_RING.includes(color);',
  '  camera.fov=portrait?(crowded?49:47):compactLandscape?45:43;',
  '  const distance=portrait?(crowded?680:620):compactLandscape?470:560;',
  '  const height=portrait?(crowded?650:590):compactLandscape?350:445;',
  '  const offset=portrait?54:88;',
  '  if(!valid)camera.position.set(portrait?(crowded?380:330):compactLandscape?245:520,portrait?(crowded?620:560):compactLandscape?325:430,portrait?(crowded?510:455):compactLandscape?285:520);',
  '  else if(color===\'right\')camera.position.set(distance,height,offset);',
  '  else if(color===\'left\')camera.position.set(-distance,height,-offset);',
  '  else if(color===\'front\')camera.position.set(offset,height,distance);',
  '  else camera.position.set(-offset,height,-distance);',
  '  camera.near=.5;camera.far=12000;',
  '  camera.updateProjectionMatrix();',
  '  controls.target.set(0,portrait?18:0,0);',
  '  controls.minDistance=portrait?(crowded?540:500):compactLandscape?430:420;',
  '  controls.maxDistance=portrait?1080:compactLandscape?980:1350;',
  '  controls.update();keepInsideRoom();render();',
  '}',
  'function setResponsiveOverview(){setPlayerView(gameState.humanColor)}',
  'function fit(objects){const box=new THREE.Box3();objects.forEach(o=>box.expandByObject(o));const s=box.getSize(new THREE.Vector3()),dist=(Math.max(s.x,s.y,s.z)||260)*1.65;camera.position.set(dist,dist*.82,dist);camera.near=Math.max(dist/1200,.1);camera.far=dist*22;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();keepInsideRoom()}',
  'function frame(now)`,',
  "  'preserve the established setup framing'",
  ');',
  'replaceExact(',
  '  "gameState.configured=true;\\n  clearGroup(setupGroup);",',
  '  "gameState.configured=true;\\n  setPlayerView(gameState.humanColor);\\n  clearGroup(setupGroup);",',
  "  'switch to play framing only after setup is confirmed'",
  ');',
  'replaceExact(',
  '  "addEventListener(\'resize\',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(performancePixelRatio());renderer.setSize(innerWidth,innerHeight);render()},{passive:true});",',
  '  "addEventListener(\'resize\',()=>{camera.aspect=innerWidth/innerHeight;renderer.setPixelRatio(performancePixelRatio());renderer.setSize(innerWidth,innerHeight);if(gameState.configured)setPlayerView(gameState.humanColor);else{camera.updateProjectionMatrix();render()}},{passive:true});",',
  "  'keep setup framing until the game is configured'",
  ');',
  'replaceExact(',
  '  "globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE};",',
  '  "globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE,meshes,controls,render,clearHighlights,showWinHighlight,syncZoneMarkers,setResponsiveOverview,setPlayerView,renderSetup3D,closePieceTray,updateTurnGlow,syncActiveReadinessBases};",',
  "  'expose the native setup and piece-selection bridge'",
  ');'
].join('\n');

const sharedRulesPatch = [
  'replaceExact(',
  '  "function emptyBoard(){\\n  const board={};\\n  boardZones.forEach(z=>board[z.id]={s:null,m:null,l:null});\\n  return board;\\n}",',
  '  "function emptyBoard(){return globalThis.__yakolakRulesV126.createEmptyBoard()}",',
  "  'share the canonical empty board'",
  ');',
  'replaceExact(',
  '  "  gameState.turnIndex=0;\\n",',
  '  "  gameState.turnIndex=(gameState.round-1)%gameState.players.length;\\n",',
  "  'rotate the round starter in offline and online play'",
  ');',
  'replaceRegex(',
  '  /function nextTurn\\(\\)\\{.*?\\n\\}\\nfunction isHumanTurn/s,',
  '  `function nextTurn(){',
  '  if(gameState.winner)return;',
  '  if(selectionTray)closePieceTray();',
  '  const next=globalThis.__yakolakRulesV126.nextPlayableTurn(gameState.players,gameState.turnIndex,gameState.board);',
  "  if(next==null){caption('تعادل. جولة جديدة.');setTimeout(()=>{gameState.round++;startRound(true)},1200);return}",
  '  gameState.turnIndex=next;',
  '  caption(turnCaption(currentPlayer()));',
  '  startTurnTimer();',
  '  updateTurnGlow();',
  '  maybeBotTurn();',
  '}',
  'function isHumanTurn`,',
  "  'share canonical playable-turn resolution'",
  ');',
  'replaceRegex(',
  '  /function legalMoves\\(color\\)\\{.*?\\n\\}\\nfunction testBoardMove/s,',
  '  `function legalMoves(color){return globalThis.__yakolakRulesV126.listLegalMoves(gameState.board,color).map(move=>({piece:pieces.find(p=>p.dir===color&&p.type===move.size&&!p.placed),zone:move.zone,size:move.size,color})).filter(move=>move.piece)}',
  'function testBoardMove`,',
  "  'share canonical legal moves'",
  ');',
  'replaceRegex(',
  '  /function winnerOn\\(board,color\\)\\{.*?\\n\\}\\nfunction describeWin/s,',
  '  `function winnerOn(board,color){return globalThis.__yakolakRulesV126.winnerForBoard(board,color)}',
  'function describeWin`,',
  "  'share canonical winner resolution'",
  ');'
].join('\n');

replaceExact(
  "source+='\\n//# sourceURL=yakolak-v112-action-tutorial-runtime.js\\n';",
  releasePatch + '\n' + sharedRulesPatch + "\nsource+='\\n//# sourceURL=yakolak-v120-mobile-board-separation-runtime.js\\n';",
  'inject v120 policies'
);
replaceExact(
  "globalThis.__yakolakV112={build:112,base:110,tutorial:'short-skippable-action-led'};",
  "globalThis.__yakolakV117={build:117,base:116,change:'reuse-native-setup-tray-and-table-online'};globalThis.__yakolakV120={build:120,base:119,change:'mobile-only-board-separation'};",
  'v120 runtime marker'
);

const moduleUrl = URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
  await import('./online-client-v114.js?v=120-mobile-board-separation-client');
} finally {
  setTimeout(() => URL.revokeObjectURL(moduleUrl), 15000);
}
