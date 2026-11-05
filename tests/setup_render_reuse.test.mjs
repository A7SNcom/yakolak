import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {mountSetup} from '../ui/visual-setup.mjs';

const source=readFileSync(new URL('../ui/visual-setup.mjs',import.meta.url),'utf8');
const lensSource=readFileSync(new URL('../ui/vendor/liquefy-core-1.1.0.mjs',import.meta.url),'utf8');

test('geometry delivery while closed avoids layout and applies the latest points on reopen',()=>{
 const {window}=new JSDOM('<body></body>',{url:'https://a7sncom.github.io/yakolak/'});
 window.matchMedia=()=>({matches:true});
 const api=mountSetup(window.document,window,null);
 const root=window.document.querySelector('#yakolakVisualSetup');let reads=0;
 root.getBoundingClientRect=()=>{reads++;return {height:844};};
 api.geometry({world:true,seats:{marble:[.7,.6]}});
 assert.equal(reads,0);
 api.open({online:true,preview_step:'color'});
 assert.ok(reads>0);
 assert.equal(root.querySelector('[data-color=marble]').style.left,`${.7*window.innerWidth}px`);
 api.close();reads=0;
 api.geometry({world:true,seats:{marble:[.8,.5]}});
 assert.equal(reads,0);
 api.open({online:true,preview_step:'color'});
 assert.equal(root.querySelector('[data-color=marble]').style.left,`${.8*window.innerWidth}px`);
 api.close();window.close();
});

test('folded surfaces skip identical SVG writes while preserving geometry, colors and orientation',()=>{
 const {window}=new JSDOM('<body><button></button></body>');
 const {document}=window,node=document.querySelector('button');
 const context=vm.createContext({document});
 const start=source.indexOf("  const ns='http://www.w3.org/2000/svg';");
 const end=source.indexOf('  for(const {b,color,status} of seatButtons)');
 vm.runInContext(source.slice(start,end)+'\nthis.paint=paintSurface;',context);
 const surface={width:180,height:70,path:'M 0 0 L 180 70 Z',bow:4,side:1,angle:3};
 context.paint(node,surface,'blue');
 assert.equal(node.orbit.face.getAttribute('stroke'),'#77b4ff');
 assert.equal(node.orbit.svg.getAttribute('viewBox'),'0 0 180 70');
 const observer=new window.MutationObserver(()=>{});
 observer.observe(node,{attributes:true,subtree:true});
 for(let i=0;i<100;i++)context.paint(node,{...surface,angle:i,side:-1},'blue');
 assert.equal(observer.takeRecords().length,0);
 assert.equal(node.orbit.angle,99);assert.equal(node.orbit.side,-1);
 context.paint(node,{...surface,path:'M 0 0 L 90 40 Z',width:90,bow:-4},'gold');
 assert.equal(node.orbit.face.getAttribute('d'),'M 0 0 L 90 40 Z');
 assert.equal(node.orbit.svg.getAttribute('viewBox'),'0 0 90 70');
 assert.equal(node.orbit.face.getAttribute('stroke'),'#e6be7b');
 assert.equal(node.style.getPropertyValue('--yk-bow'),'-4px');
 node.classList.add('is-off');context.paint(node,surface,'gold');
 assert.equal(node.orbit.face.getAttribute('stroke'),'#707782');
 node.classList.remove('is-off');context.paint(node,surface,'gold');
 assert.equal(node.orbit.face.getAttribute('stroke'),'#e6be7b');
 observer.disconnect();window.close();
});

test('lens refresh reuses its map and regenerates for every changed map input',()=>{
 const {window}=new JSDOM('<body><button style="border-top-left-radius:16px"></button></body>');
 const element=window.document.querySelector('button');let width=158,height=56,calls=0,frame=0;
 const frames=new Map();let resize;
 Object.defineProperties(element,{offsetWidth:{get:()=>width},offsetHeight:{get:()=>height}});
 const context=vm.createContext({
  isLensSupported:()=>true,mediaQuery:()=>({matches:false}),clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),filterCount:0,
  createElement:(tag,attrs)=>{const node=window.document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);return node;},
  getDefsRoot:()=>window.document.body,getComputedStyle:node=>window.getComputedStyle(node),
  createLensMap:options=>{calls++;return {url:'data:image/png;base64,'+JSON.stringify(options),scale:options.width*.1};},
  requestAnimationFrame:callback=>{frames.set(++frame,callback);return frame;},cancelAnimationFrame:id=>frames.delete(id),
  ResizeObserver:class{constructor(callback){resize=callback;}observe(){}disconnect(){}}
 });
 vm.runInContext(lensSource.slice(lensSource.indexOf('const attachLiquidLens ='),lensSource.indexOf('//#region src/elastic.ts'))+'\nthis.attach=attachLiquidLens;',context);
 const options={strength:.32,blur:14,dispersion:0,saturation:1};
 const lens=context.attach(element,options);
 const flush=()=>{for(const [id,callback] of [...frames]){frames.delete(id);callback();}};
 flush();assert.equal(calls,1);
 const image=window.document.querySelector('feImage').getAttribute('href');
 for(let i=0;i<100;i++){resize();flush();}
 assert.equal(calls,1);assert.equal(window.document.querySelector('feImage').getAttribute('href'),image);
 for(const change of [()=>width=200,()=>height=60,()=>element.style.borderTopLeftRadius='20px',()=>options.radius=12,()=>options.bezel=15,()=>options.curve=3]){
  const before=calls;change();lens.refresh();flush();assert.equal(calls,before+1);
 }
 // A hidden element must not replace the last usable map with a zero-sized one.
 width=0;lens.refresh();flush();assert.equal(calls,7);
 width=200;lens.refresh();flush();assert.equal(calls,7);
 lens.refresh();lens.destroy();flush();assert.equal(calls,7);
 assert.equal(window.document.querySelector('filter'),null);
 assert.equal(element.style.getPropertyValue('--lq-lens'),'');window.close();
});
