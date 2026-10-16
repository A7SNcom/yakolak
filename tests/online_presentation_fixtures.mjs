// Canonical host snapshots for engine presentation tests, not a network substitute.
import {writeFile,mkdir} from 'node:fs/promises';
import {RoomAuthority} from '../ui/p2p-authority.mjs';
const colors=['marble','blue','gold','green'];
let sequence=0;
function room(count,code){
 const config={rounds:3,players:colors.slice(0,count).map((color,i)=>({color,mode:i?'online':'local',label:i?'':'أحمد'}))};
 const authority=new RoomAuthority({code,epoch:'e'.repeat(48),peerId:'peer1',token:'h'.repeat(48),config});
 for(let i=1;i<count;i++)authority.join('peer'+(i+1),{token:String(i).repeat(48),name:'لاعب '+(i+1)});
 authority.start(config);return authority;
}
function command(a,peer,kind,extra={}){return a.command(peer,kind,{epoch:a.epoch,version:a.state.version,mutationId:String(++sequence).padStart(48,'0'),...extra});}
const two=room(2,'628'),four=room(4,'629');
const cases={two:[two.snapshot()],four:[four.snapshot()]};
for(const [peer,cell,size] of [['peer1',8,'small'],['peer2',6,'large'],['peer1',4,'small'],['peer2',3,'large'],['peer1',0,'small']])cases.two.push(command(two,peer,'move',{cell,size}));
cases.vote=command(two,'peer1','rematch');
cases.nextRound=command(two,'peer2','rematch');
for(const [peer,cell,size] of [['peer1',8,'small'],['peer2',7,'medium'],['peer3',6,'large'],['peer4',5,'small']])cases.four.push(command(four,peer,'move',{cell,size}));
let now=100000;
const mixedConfig={rounds:3,players:[{color:'marble',mode:'local'},{color:'blue',mode:'online'},{color:'gold',mode:'local'},{color:'green',mode:'bot'}]};
const mixed=new RoomAuthority({code:'630',epoch:'e'.repeat(48),peerId:'peer1',token:'h'.repeat(48),config:mixedConfig,now:()=>now});mixed.join('peer2',{token:'2'.repeat(48),name:'ريم'});mixed.start(mixedConfig);
cases.mixed=[mixed.snapshot()];cases.mixed.push(command(mixed,'peer1','move',{cell:0,size:'small',seat:'p1'}));cases.mixed.push(command(mixed,'peer2','move',{cell:8,size:'large',seat:'p2'}));cases.mixed.push(command(mixed,'peer1','move',{cell:1,size:'small',seat:'p3'}));now+=650;mixed.advance();cases.mixed.push(mixed.snapshot());
await mkdir(new URL('../generated/',import.meta.url),{recursive:true});
await writeFile(new URL('../generated/online-presentation.json',import.meta.url),JSON.stringify(cases));
