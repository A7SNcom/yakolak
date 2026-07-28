import {ACTION, APP_PHASE, VALID_MODES} from './entry-contracts.js';

/** @returns {import('./entry-contracts.js').AppState} */
export function createInitialState(){
  return Object.freeze({phase:APP_PHASE.BOOT,selectedMode:null,revision:0});
}

/**
 * @param {import('./entry-contracts.js').AppState} state
 * @param {import('./entry-contracts.js').Action} action
 * @returns {{state: import('./entry-contracts.js').AppState, effects: import('./entry-contracts.js').Effect[]}}
 */
export function transitionEntryState(state,action){
  if(!state||!action||typeof action.type!=='string'){
    return rejected(state??createInitialState(),String(action?.type||'UNKNOWN'),'invalid_action');
  }

  if(state.phase===APP_PHASE.BOOT&&action.type===ACTION.BOOT_COMPLETED){
    return changed(state,{phase:APP_PHASE.ENTRY,selectedMode:null},action.type);
  }

  if(state.phase===APP_PHASE.ENTRY&&action.type===ACTION.OPEN_MODE_SELECTION){
    return changed(state,{phase:APP_PHASE.MODE_SELECTION,selectedMode:null},action.type);
  }

  if(state.phase===APP_PHASE.MODE_SELECTION&&action.type===ACTION.SELECT_MODE){
    if(!VALID_MODES.has(action.mode))return rejected(state,action.type,'invalid_mode');
    return changed(state,{phase:APP_PHASE.MODE_SELECTION,selectedMode:action.mode},action.type);
  }

  return rejected(state,action.type,'invalid_transition');
}

/** @param {import('./entry-contracts.js').AppState} state */
export function toRenderSnapshot(state){
  return Object.freeze({
    phase:state.phase,
    showLoader:state.phase===APP_PHASE.BOOT,
    showEntry:state.phase===APP_PHASE.ENTRY,
    showModeSelection:state.phase===APP_PHASE.MODE_SELECTION,
    selectedMode:state.selectedMode,
  });
}

function changed(previous,next,actionType){
  const state=Object.freeze({...next,revision:previous.revision+1});
  return{state,effects:[Object.freeze({type:'STATE_CHANGED',actionType,phase:state.phase})]};
}

function rejected(state,actionType,reason){
  return{state,effects:[Object.freeze({type:'TRANSITION_REJECTED',actionType,phase:state.phase,reason})]};
}
