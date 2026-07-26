import fs from 'node:fs';

const js=fs.readFileSync(new URL('../src/app-game-v124.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles/v124-room-services.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));

const checks=[
  ['imports stage 2',js.includes("app-game-v123.js?v=124-stage3-base")],
  ['right wall service',js.includes('yakolak-room-online-service-screen')&&js.includes('serviceGroup.position.set(2386')],
  ['canvas texture',js.includes('new THREE.CanvasTexture(serviceCanvas)')&&js.includes('new THREE.CanvasTexture(learnCanvas)')],
  ['room-code keypad',js.includes("KEYS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'")&&js.includes("'key:'")],
  ['backend create and join',js.includes("backendButton('إنشاء غرفة')")&&js.includes("backendButton('دخول برمز')")],
  ['learn inside table',js.includes('yakolak-room-howto-screen')&&js.includes('ثلاث قطع من الحجم نفسه')&&js.includes('الأحجام الثلاثة في خانة واحدة')],
  ['lobby mirror',js.includes('yakolak-room-lobby-screen')&&js.includes('نسخ رابط الدعوة')],
  ['raycaster interaction',js.includes('new THREE.Raycaster()')&&js.includes('hitFromUv')],
  ['old overlays hidden',css.includes('#yakolakOnlineDialog')&&css.includes('#yakolakHowTo')],
  ['app build 124',app.includes("const BUILD='124'")&&app.includes('app-game-v124.js')],
  ['index build 124',index.includes("const BUILD='124'")&&index.includes('v124-room-services-stage3')],
  ['version build 124',version.build===124&&version.version==='v124-room-services-stage3']
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'✓':'✗'} ${name}`);
if(failed.length)process.exit(1);
