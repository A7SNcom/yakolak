const response=await fetch('./src/app-game-developer-d1.js?v=D4-state-bridge-source',{cache:'no-store'});
if(!response.ok)throw new Error(`D4 state bridge load failed: ${response.status}`);
let source=await response.text();
const current='globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE,controls,meshes,render,clearHighlights,showWinHighlight,syncZoneMarkers,setResponsiveOverview,renderSetup3D,closePieceTray,updateTurnGlow,syncActiveReadinessBases};';
const extended='globalThis.__yakolakGame={state:gameState,pieces,boardZones,camera,renderer,gameGroup,setupGroup,gameHighlightGroup,THREE,controls,meshes,render,clearHighlights,showWinHighlight,syncZoneMarkers,setResponsiveOverview,renderSetup3D,closePieceTray,updateTurnGlow,syncActiveReadinessBases,syncScoreHud,caption,startTurnTimer,clearTurnTimer,previewWinnerHighlightPreset,ensureTutorialDialog,resetTutorialPieces};';
const count=source.split(current).length-1;
if(count!==1)throw new Error(`D4 state bridge expected one runtime export, found ${count}`);
source=source.replace(current,extended);
source+='\n//# sourceURL=yakolak-developer-d4-wrapper.js\n';
const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
try{await import(moduleUrl)}finally{setTimeout(()=>URL.revokeObjectURL(moduleUrl),15000)}
