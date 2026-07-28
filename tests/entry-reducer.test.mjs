import assert from 'node:assert/strict';
import test from 'node:test';
import {ACTION,APP_PHASE,MODE} from '../src/core/entry-contracts.js';
import {createInitialState,toRenderSnapshot,transitionEntryState} from '../src/core/entry-reducer.js';

test('initial state is deterministic boot state',()=>{
  const state=createInitialState();
  assert.deepEqual(state,{phase:APP_PHASE.BOOT,selectedMode:null,revision:0});
  assert.deepEqual(toRenderSnapshot(state),{
    phase:APP_PHASE.BOOT,showLoader:true,showEntry:false,showModeSelection:false,selectedMode:null,
  });
});

test('boot advances to entry then mode selection',()=>{
  const entry=transitionEntryState(createInitialState(),{type:ACTION.BOOT_COMPLETED});
  assert.equal(entry.state.phase,APP_PHASE.ENTRY);
  assert.equal(entry.state.revision,1);
  assert.equal(entry.effects[0].type,'STATE_CHANGED');

  const modes=transitionEntryState(entry.state,{type:ACTION.OPEN_MODE_SELECTION});
  assert.equal(modes.state.phase,APP_PHASE.MODE_SELECTION);
  assert.equal(modes.state.revision,2);
  assert.equal(toRenderSnapshot(modes.state).showModeSelection,true);
});

test('mode selection records a valid mode deterministically',()=>{
  const entry=transitionEntryState(createInitialState(),{type:ACTION.BOOT_COMPLETED}).state;
  const modes=transitionEntryState(entry,{type:ACTION.OPEN_MODE_SELECTION}).state;
  const selected=transitionEntryState(modes,{type:ACTION.SELECT_MODE,mode:MODE.ONLINE});
  assert.equal(selected.state.selectedMode,MODE.ONLINE);
  assert.equal(selected.state.revision,3);
});

test('invalid transition preserves state and emits rejection',()=>{
  const state=createInitialState();
  const result=transitionEntryState(state,{type:ACTION.OPEN_MODE_SELECTION});
  assert.strictEqual(result.state,state);
  assert.deepEqual(result.effects,[{
    type:'TRANSITION_REJECTED',actionType:ACTION.OPEN_MODE_SELECTION,phase:APP_PHASE.BOOT,reason:'invalid_transition',
  }]);
});

test('invalid mode preserves state and emits rejection',()=>{
  const entry=transitionEntryState(createInitialState(),{type:ACTION.BOOT_COMPLETED}).state;
  const modes=transitionEntryState(entry,{type:ACTION.OPEN_MODE_SELECTION}).state;
  const result=transitionEntryState(modes,{type:ACTION.SELECT_MODE,mode:'invalid'});
  assert.strictEqual(result.state,modes);
  assert.equal(result.effects[0].reason,'invalid_mode');
});
