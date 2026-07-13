console.info('[Yakolak] APP.JS v094 INTERACTIVE ONBOARDING LOADED');

globalThis.__yakolakV094=true;
const BUILD='94';
const GAME_URL='./src/app-game-v085.js?v='+BUILD;

async function loadV094Game(){
  try{
    const response=await fetch(GAME_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`game source ${response.status}`);
    let source=await response.text();
    const legacy=`  showAllReadinessBasesForTutorial();\n  await runTutorial();\n  await resetTutorialPieces(true);`;
    const replacement=`  if(!globalThis.__yakolakV094){\n    showAllReadinessBasesForTutorial();\n    await runTutorial();\n    await resetTutorialPieces(true);\n  }`;
    if(!source.includes(legacy))throw new Error('legacy tutorial anchor missing');
    source=source.replace(legacy,replacement);
    const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{await import(blobUrl)}finally{URL.revokeObjectURL(blobUrl)}
  }catch(error){
    console.warn('[Yakolak] v094 prepared import failed; using direct game module',error);
    await import(GAME_URL);
  }
}

await loadV094Game();
await import('./src/onboarding-v094.js?v='+BUILD);
