const response=await fetch('./src/app-game-v112.js?v=113-first-move-breathing-room-wrapper',{cache:'no-store'});
if(!response.ok)throw new Error(`v113 wrapper load failed: ${response.status}`);
let wrapper=await response.text();

function replaceExact(oldValue,newValue,label){
  const count=wrapper.split(oldValue).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  wrapper=wrapper.replace(oldValue,newValue);
}

replaceExact(
  "const response=await fetch('./src/app-game-v085.js?v=112-action-tutorial-source',{cache:'no-store'});",
  "const response=await fetch('./src/app-game-v085.js?v=113-first-move-breathing-room-source',{cache:'no-store'});",
  'v113 source marker'
);
replaceExact("const BUILD='112';","const BUILD='113';",'v113 build number');
const firstMoveTimerPatch=[
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
  ');'
].join('\n');
replaceExact(
  "source+='\\n//# sourceURL=yakolak-v112-action-tutorial-runtime.js\\n';",
  firstMoveTimerPatch+"\nsource+='\\n//# sourceURL=yakolak-v113-first-move-breathing-room-runtime.js\\n';",
  'inject first-move timer policy'
);
replaceExact(
  "globalThis.__yakolakV112={build:112,base:110,tutorial:'short-skippable-action-led'};",
  "globalThis.__yakolakV113={build:113,base:112,change:'first-guided-turn-has-no-deadline'};",
  'v113 runtime marker'
);

const moduleUrl=URL.createObjectURL(new Blob([wrapper],{type:'text/javascript'}));
try{
  await import(moduleUrl);
}finally{
  setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000);
}
