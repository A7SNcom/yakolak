import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const index=read('index.html');
const app=read('app.js');
const stage=read('src/app-game-v125.js');
const version=JSON.parse(read('version.json'));

assert(index.includes('v125-white-wall-continuity'),'index metadata is not Build 125');
assert(index.includes('--yakolak-wall:#f7f7f4'),'loader wall color is missing');
assert(index.includes('#yakolakLoader.done.wall-ready'),'loader is not gated by the real wall readiness');
assert(index.includes('__yakolakReleaseWallLoader'),'loader release bridge is missing');
assert(!index.includes('loader-scan'),'legacy futuristic loader scan is still present');
assert(!index.includes('radial-gradient(circle at 50% 18%'),'legacy dark loader background is still present');

assert(app.includes("const BUILD='125'"),'app build number is not 125');
assert(app.includes("import('./src/app-game-v125.js?v='+BUILD+'-white-wall-continuity-1')"),'Build 125 stage is not loaded');
assert(app.includes('whiteWall.finalize()'),'white wall is not finalized before loader release');

assert(stage.includes("const WALL_COLOR='#f7f7f4'"),'stage wall color does not match loader');
assert(stage.includes("roomMenu.group.visible=false"),'legacy blue projection is not disabled');
assert(stage.includes("globalThis.__yakolakReleaseWallLoader?.()"),'stage does not release the loader after the wall is ready');
assert(stage.includes("scene.getObjectByName('room-back-wall')"),'real room wall is not recolored');
assert(stage.includes("name='yakolak-v125-white-wall-menu'" )||stage.includes("group.name='yakolak-v125-white-wall-menu'"),'neutral wall menu group is missing');
assert(!stage.includes('0x55c9e8'),'futuristic cyan halo leaked into Build 125');

assert(version.build===125,'version.json build is not 125');
assert(version.version==='v125-white-wall-continuity','version.json version is incorrect');

console.log('Build 125 white wall verification passed.');
