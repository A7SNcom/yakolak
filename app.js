const BUILD='79';
const params=new URLSearchParams(location.search);

await import(`./src/room-black-patch.js?v=${BUILD}`);
await import(`./src/room-client.js?v=${BUILD}`);
await import(`./src/ui-shell.js?v=${BUILD}`);

if(params.get('dev')==='1'){
  await import(`./src/lights.js?v=${BUILD}`);
  console.info('[Yakolak] developer light calibration enabled');
}

console.info('[Yakolak] APP.JS v079 ONLINE FOUNDATION LOADED');
await import(`./src/app-prod-stage1.js?v=${BUILD}`);
