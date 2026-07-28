import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  sceneDefinitions,
  elementDefinitions,
  variantsFor
} from '../src/developer-d4-registry.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const strict=process.argv.includes('--strict');
const outputArg=process.argv.find(value=>value.startsWith('--output='));
const outputPath=path.resolve(root,outputArg?.slice('--output='.length)||'artifacts/developer-d4-journey-audit.json');

const read=relative=>readFile(path.join(root,relative),'utf8');
const [engine,online,states,wrapper]=await Promise.all([
  read('src/app-game-v085.js'),
  read('src/online-client-v114.js'),
  read('src/developer-scene-d4-states.js'),
  read('src/app-game-developer-d4.js')
]);

const scene=id=>sceneDefinitions.find(item=>item.id===id);
const element=id=>elementDefinitions.find(item=>item.id===id);
const variantIds=definition=>definition?variantsFor(definition).map(item=>item.id):[];
const hasVariants=(definition,expected)=>expected.every(id=>variantIds(definition).includes(id));
const result=(id,priority,title,pass,evidence,acceptance)=>({id,priority,title,pass:Boolean(pass),evidence,acceptance});

const integrity=[];
const definitionKeys=new Set();
for(const definition of [...sceneDefinitions,...elementDefinitions]){
  const key=`${definition.kind}:${definition.id}`;
  if(definitionKeys.has(key))integrity.push(`duplicate definition ${key}`);
  definitionKeys.add(key);
  if(!definition.sourceKey?.trim())integrity.push(`missing sourceKey ${key}`);
  const ids=new Set();
  for(const variant of variantsFor(definition)){
    if(ids.has(variant.id))integrity.push(`duplicate variant ${key}:${variant.id}`);
    ids.add(variant.id);
  }
}

const checks=[
  result(
    'local-player-counts',
    'P0',
    'Represent all supported local player counts',
    engine.includes("[1,'لاعبان'],[2,'3 لاعبين'],[3,'4 لاعبين']")&&hasVariants(scene('gameplay-ready'),['two-players','three-players','four-players'])&&hasVariants(element('game-hud'),['two-players','three-players','four-players']),
    ['src/app-game-v085.js: renderSetupStep exposes 2, 3 and 4 players','src/developer-d4-registry.js: gameplay-ready and game-hud variants'],
    'Add a three-players variant and make playersFor(3) return exactly three colors.'
  ),
  result(
    'turn-index-contract',
    'P0',
    'Use the runtime turnIndex contract',
    engine.includes('gameState.turnIndex')&&states.includes('turnIndex:Math.max(0,players.indexOf(color))')&&!states.includes('currentIndex:'),
    ['src/app-game-v085.js: currentPlayer and nextTurn read gameState.turnIndex','src/developer-scene-d4-states.js: setupPlay/configureTurn'],
    'Replace D4 currentIndex writes with turnIndex and verify every color variant activates the matching player.'
  ),
  result(
    'online-dialog-contract',
    'P0',
    'Preview the real online dialog, not only its entry button',
    online.includes("dialog.id = 'yakolakOnlineDialog'")&&states.includes("showDom('yakolakOnlineDialog')"),
    ['src/online-client-v114.js: buildUi creates yakolakOnlineEntry and yakolakOnlineDialog separately','src/developer-scene-d4-states.js: configureOnline'],
    'Render/open yakolakOnlineDialog with the requested native state; keep yakolakOnlineEntry only as the launcher.'
  ),
  result(
    'blob-relative-import',
    'P0',
    'Keep nested online imports resolvable in the D4 runtime bridge',
    !wrapper.includes('new Blob([source]')||wrapper.includes('online-client-v114.js'),
    ['src/app-game-developer-d4.js imports the D1 wrapper source through a Blob','src/app-game-developer-d1.js contains a relative dynamic import of online-client-v114.js'],
    'Avoid nesting the D1 wrapper in a Blob, or rewrite the online-client import to an absolute module URL before import.'
  ),
  result(
    'draw-result',
    'P1',
    'Represent the no-legal-moves draw result',
    engine.includes("caption('تعادل. جولة جديدة.')")&&(variantIds(scene('round-result')).includes('draw')||Boolean(scene('draw-result'))),
    ['src/app-game-v085.js: finishMove starts a new round after a draw','src/developer-d4-registry.js: result states'],
    'Add a draw result variant or dedicated draw-result scene.'
  ),
  result(
    'bot-thinking',
    'P1',
    'Represent the locked bot-thinking turn',
    engine.includes("caption(`${colorName(color)} يفكر...`)")&&variantIds(scene('turn-state')).includes('bot-thinking'),
    ['src/app-game-v085.js: maybeBotTurn locks input and announces thinking','src/developer-d4-registry.js: turn-state variants'],
    'Add a bot-thinking variant with locked input and the real HUD caption.'
  ),
  result(
    'turn-timeout',
    'P1',
    'Represent the timer-expired transition',
    engine.includes('انتهى وقت ${colorName(skipped)}')&&variantIds(scene('turn-state')).includes('timeout'),
    ['src/app-game-v085.js: startTurnTimer skips an expired turn','src/developer-d4-registry.js: turn-state variants'],
    'Add a timeout variant showing the expired player and next-turn transition.'
  ),
  result(
    'piece-tray',
    'P1',
    'Represent the opened piece tray and selected size',
    engine.includes('selectionTray')&&engine.includes('openPieceTray')&&Boolean(element('piece-tray')),
    ['src/app-game-v085.js: selectionTray/openPieceTray are a primary interaction state','src/developer-d4-registry.js: UI elements'],
    'Add a piece-tray element with opened and selected-size variants.'
  ),
  result(
    'last-move-marker',
    'P1',
    'Represent local and online last-move markers',
    engine.includes('lastMoveMarkers')&&online.includes('onlineLastMoveMarker')&&Boolean(element('last-move-marker')),
    ['src/app-game-v085.js: showLastMoveMarker','src/online-client-v114.js: showOnlineLastMove','src/developer-d4-registry.js: UI elements'],
    'Add one last-move-marker element with local and online variants.'
  ),
  result(
    'online-lifecycle',
    'P1',
    'Cover the complete online room lifecycle',
    hasVariants(scene('online-entry'),['landing','room-code','waiting','playing','finished','cancelled','invite-loading','error']),
    ['src/online-client-v114.js: renderHome/renderWaiting/renderPlayingRoom/renderFinished/applyRoom/restoreInvite/errorMessage','src/developer-d4-registry.js: online-entry variants'],
    'Add native variants for playing, finished/rematch, cancelled, invite loading and recoverable error/offline states.'
  ),
  result(
    'online-status-pill',
    'P2',
    'Represent the persistent online status pill',
    online.includes("pill.id = 'yakolakOnlinePill'")&&Boolean(element('online-status-pill')),
    ['src/online-client-v114.js: yakolakOnlinePill exposes waiting/playing/finished status','src/developer-d4-registry.js: UI elements'],
    'Add an online-status-pill element with online, offline and error variants.'
  )
];

const gaps=checks.filter(item=>!item.pass);
const criticalGaps=gaps.filter(item=>item.priority==='P0');
const report={
  generatedAt:new Date().toISOString(),
  mode:strict?'strict':'advisory',
  summary:{
    scenes:sceneDefinitions.length,
    elements:elementDefinitions.length,
    checks:checks.length,
    passed:checks.length-gaps.length,
    gaps:gaps.length,
    criticalGaps:criticalGaps.length,
    integrityFailures:integrity.length
  },
  integrity,
  checks,
  nextAction:criticalGaps.length?'Resolve P0 runtime-contract gaps before visual acceptance.':'Proceed to P1 journey completeness and browser evidence.'
};

await mkdir(path.dirname(outputPath),{recursive:true});
await writeFile(outputPath,`${JSON.stringify(report,null,2)}\n`,'utf8');

for(const item of checks){
  console.log(`${item.pass?'PASS':'GAP '} ${item.priority} ${item.id} — ${item.title}`);
}
console.log(`D4 journey audit: ${report.summary.passed}/${report.summary.checks} passed; ${report.summary.criticalGaps} critical gaps; report ${path.relative(root,outputPath)}`);

if(integrity.length||(strict&&gaps.length))process.exitCode=1;
