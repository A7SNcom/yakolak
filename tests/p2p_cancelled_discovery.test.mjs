import test from 'node:test';
import assert from 'node:assert/strict';
import {TrysteroClient} from '../ui/online-trystero.mjs';

function harness(){
  const client=new TrysteroClient({setInterval(){return 0},addEventListener(){},sessionStorage:{getItem(){return null}}});
  const pending=[];
  client.open=async(code,role)=>{
    const session={code,role,epoch:'e'.repeat(48),closed:false,leaves:0};
    session.room={async leave(){session.leaves++}};
    client.session=session;return session;
  };
  client.waitSignaling=session=>new Promise((resolve,reject)=>pending.push({session,resolve,reject}));
  return {client,pending};
}

for(const kind of ['host','guest'])test(`cancelled ${kind} discovery cannot close a newer room when its network request fails late`,async()=>{
  const {client,pending}=harness();
  const operation=kind==='host'
    ?client.prepareHost({rounds:3,players:[{mode:'local',color:'marble',label:'أحمد'},{mode:'online',color:'blue'}]})
    :client.join('111');
  const result=operation.then(()=>null,error=>error);
  try{
    for(let i=0;i<10&&!pending.length;i++)await Promise.resolve();
    assert.equal(pending.length,1);
    const old=client.session;
    await client.close();
    const replacement=await client.open('222','host');
    pending[0].reject(new Error('room_closed'));
    assert.equal((await result).message,'room_closed');
    assert.equal(old.leaves,1);
    assert.equal(client.session,replacement,'late failure belongs to the cancelled room');
    assert.equal(replacement.closed,false);
    assert.equal(replacement.leaves,0);
  }finally{
    pending[0]?.reject(new Error('room_closed'));
    await client.close();await result;
  }
});

for(const kind of ['host','guest'])test(`current ${kind} discovery still closes its own failed room`,async()=>{
  const {client,pending}=harness();
  const operation=kind==='host'
    ?client.prepareHost({rounds:3,players:[{mode:'local',color:'marble',label:'أحمد'},{mode:'online',color:'blue'}]})
    :client.join('111');
  const result=operation.then(()=>null,error=>error);
  for(let i=0;i<10&&!pending.length;i++)await Promise.resolve();
  assert.equal(pending.length,1);
  const own=client.session;
  pending[0].reject(new Error('signaling_unavailable'));
  assert.equal((await result).message,'signaling_unavailable');
  assert.equal(client.session,null);
  assert.equal(own.closed,true);
  assert.equal(own.leaves,1);
});
