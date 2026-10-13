import assert from 'node:assert/strict';
import {test} from 'node:test';
import {__testing as room} from '../api/rooms.js';

test('each connected seat consents before a round or match reset; duplicate votes do not advance',()=>{
 for(const count of [2,3,4]) for(const matchComplete of [false,true]){
  const players=Array.from({length:count},(_,i)=>({seat:`p${i+1}`,color:['marble','blue','gold','green'][i]}));
  let state={players,status:'finished',round:2,completedRounds:2,scores:{p1:2},board:{0:{small:'marble'}},matchComplete,rematch:Object.fromEntries(players.map(p=>[p.seat,false]))};
  for(let i=0;i<count-1;i++){
   state=room.rematchState(state,players[i].seat);
   assert.equal(state.status,'finished');assert.deepEqual(state.board,{0:{small:'marble'}});
   const duplicate=room.rematchState(state,players[i].seat);
   assert.deepEqual(duplicate,state);
  }
  state=room.rematchState(state,players.at(-1).seat);
  assert.equal(state.status,'playing');assert.equal(state.round,matchComplete?1:3);
  assert.ok(Object.values(state.rematch).every(x=>x===false));
  assert.throws(()=>room.rematchState(state,'p1'),/round_not_finished/);
 }
});
