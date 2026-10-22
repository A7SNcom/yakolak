import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';

const fixture=JSON.parse(execFileSync('python3',['-c',`
import json,runpy
m=runpy.run_path('scripts/apply_web_loader.py')
base='<html><body><div id="yakolakLoader" aria-busy="true"></div><div id="status-notice"></div></body></html>'
html=m['inject_startup_failure'](base)
assert m['inject_startup_failure'](html)==html
print(json.dumps({'html':html}))
`],{encoding:'utf8'}));

const open=notice=>new JSDOM(fixture.html.replace('<div id="status-notice"></div>',
  `<div id="status-notice">${notice||''}</div>`),{runScripts:'dangerously',url:'https://a7sncom.github.io/yakolak/'});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test('unsupported graphics reported before loader setup shows an Arabic error instead of endless loading',()=>{
  const dom=open('Error: WebGL2 missing'),d=dom.window.document;
  assert.equal(d.querySelector('[role=alert]').hidden,false);
  assert.match(d.querySelector('#yakolakStartupFailure p').textContent,/دعم الرسوم/);
  assert.equal(d.querySelector('#yakolakLoader').dataset.error,'true');
  assert.equal(d.querySelector('#yakolakLoader').getAttribute('aria-busy'),'false');
  assert.equal(d.querySelectorAll('#yakolakStartupFailure button').length,1);
  dom.window.close();
});

test('download rejection after loading starts exposes its reason without interpreting error text as HTML',async()=>{
  const dom=open(),d=dom.window.document;
  assert.equal(d.querySelector('[role=alert]').hidden,true);
  d.querySelector('#status-notice').textContent='Failed to fetch <img src=x onerror=alert(1)>';
  await flush();
  assert.equal(d.querySelector('[role=alert]').hidden,false);
  assert.match(d.querySelector('#yakolakStartupFailure p').textContent,/اتصال الإنترنت/);
  assert.equal(d.querySelector('#yakolakStartupFailure img'),null);
  assert.match(d.querySelector('#yakolakStartupFailure pre').textContent,/<img/);
  dom.window.close();
});

test('normal loading and successful intro leave the existing loader and gameplay alone',async()=>{
  const dom=open(),d=dom.window.document;
  for(const phase of ['loading','match-ready','complete']){
    d.body.dataset.yakolakPreIntro=phase;await flush();
    assert.equal(d.querySelector('[role=alert]').hidden,true);
    assert.equal(d.querySelector('#yakolakLoader').dataset.error,undefined);
    assert.equal(d.querySelector('#yakolakLoader').getAttribute('aria-busy'),'true');
  }
  dom.window.close();
});

test('explicit engine startup error is visible even without a native notice',async()=>{
  const dom=open(),d=dom.window.document;
  d.body.dataset.yakolakIntro='error';await flush();
  assert.equal(d.querySelector('[role=alert]').hidden,false);
  assert.equal(d.querySelector('#yakolakStartupFailure details').hidden,true);
  dom.window.close();
});
