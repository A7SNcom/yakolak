import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountSetup} from '../ui/visual-setup.mjs';
import lessons from '../rules/win-presentation.json' with {type:'json'};
import {emptyBoard,placePiece,winningPatterns} from '../api/game-rules.js';

test('all three short examples agree with the online canonical rules',()=>{
  for(const lesson of lessons){
    let board=emptyBoard();
    for(let i=0;i<lesson.moves.length;i++){
      board=placePiece(board,'blue',lesson.moves[i]);
      assert.equal(winningPatterns(board,'blue').length,i===2?1:0,'the example never wins before the final stone');
    }
    assert.deepEqual(winningPatterns(board,'blue').map(p=>p.type),[lesson.pattern]);
    assert.deepEqual(winningPatterns(board,'green'),[]);
  }
});

test('Learn is available without registration and waits for physical return before restoring setup',()=>{
  const dom=new JSDOM('<body/>',{url:'https://a7sncom.github.io/yakolak/',pretendToBeVisual:true});
  const {window}=dom,{document}=window,commands=[];
  const client={subscribe(){},inspectRoom(){assert.fail('lesson cannot inspect or join a room')},prepareHost(){assert.fail('lesson cannot create a room')}};
  window.yakolakVisualSetupAction=value=>commands.push(JSON.parse(value));
  const api=mountSetup(document,window,client);api.open({request:'one'});
  const q=s=>document.querySelector(s);
  assert.equal(q('.yk-learn').previousElementSibling.textContent,'انضمام لغرفة');
  const rackNodes=[...document.querySelectorAll('.yk-seat')];
  q('.yk-learn').click();
  assert.equal(q('.yk-modal').hidden,true,'learning never requires a phone or name');
  assert.equal(q('.yk-actions').inert,true);
  const request=commands.at(-1).request;
  assert.equal(commands.at(-1).action,'learn');
  assert.equal(q('.yk-lesson-next').disabled,true);
  api.lesson({request:'stale',stage:2,busy:false});
  assert.equal(q('.yk-lesson-title').textContent,'البرج');
  for(let stage=0;stage<3;stage++){
    api.lesson({request,stage,busy:false});
    assert.equal(q('.yk-lesson-title').textContent,lessons[stage].title);
    q('.yk-lesson-next').click();assert.equal(commands.at(-1).action,'learn-next');
  }
  assert.equal(q('.yk-lesson').hidden,false,'last click waits for the engine to return the stones');
  api.lesson({request,stage:2,busy:true});
  q('.yk-lesson-back').click();assert.equal(commands.at(-1).action,'learn-close');
  assert.equal(q('.yk-lesson').hidden,false);
  api.lesson({request,closed:true});
  assert.equal(q('.yk-lesson').hidden,true);
  assert.equal(q('.yk-actions').inert,false);
  assert.equal(document.activeElement,q('.yk-learn'));
  assert.deepEqual([...document.querySelectorAll('.yk-seat')],rackNodes,'existing player-selection surface is retained');
  assert.equal(commands.some(c=>['start','join','move'].includes(c.action)),false);
  q('.yk-learn').click();
  const next=commands.at(-1).request;assert.notEqual(next,request);
  api.lesson({request,closed:true});assert.equal(q('.yk-lesson').hidden,false,'old completion cannot close a newly opened lesson');
  api.close();api.lesson({request:next,stage:1,busy:false});
  assert.equal(q('#yakolakVisualSetup').hidden,true,'late bridge updates cannot reopen a closed setup');
  dom.window.close();
});
