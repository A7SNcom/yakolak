import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../ui/visual-setup.mjs',import.meta.url),'utf8');
// Exercise the shipping layout function with a minimal DOM surface; count actual
// calls to the SVG path builder. The oracle calls the public uncached API.
const geometryCode=source.slice(source.indexOf('export function orbitRibbonGeometry'),source.indexOf('export const COLORS')).replaceAll('export ','');
const layoutCode=source.slice(source.indexOf('  function refreshOrbitLayout(){'),source.indexOf('\n  function refreshGlass(){'));

test('orbit layout reuses exact surfaces within a frame and refits on resize',()=>{
 const context=vm.createContext({});
 vm.runInContext(geometryCode+`
 let calls=0;
 const uncachedSurface=foldedSurfaceGeometry;
 foldedSurfaceGeometry=(...args)=>{calls++;return uncachedSurface(...args);};
 let currentOrbit=null;
 const root={hidden:false,getBoundingClientRect:()=>({height:window.innerHeight})};
 const state={step:'ready'},guestPhase='',guestPreview=null;
 const window={innerWidth:390,innerHeight:844};
 const geometry={};
 const names=['gold','blue','green','marble'];
 const seatButtons=names.map(id=>({color:{id},b:{style:{setProperty(k,v){this[k]=v;}},dataset:{}},status:{style:{}}}));
 let painted=[];
 function paintSurface(node,plate,color){painted.push({plate,color});}
 `+layoutCode+`
 this.run=(width,height)=>{
  window.innerWidth=width;window.innerHeight=height;calls=0;painted=[];
  refreshOrbitLayout();
  const count=calls;
  const expected=painted.map(({plate})=>orbitPlateGeometry(currentOrbit,plate.left+plate.width/2,plate.side,plate.width,width<700?48:60));
  return JSON.stringify({count,actual:painted.map(x=>x.plate),expected});
 };
 `,context);
 for(const [w,h] of [[390,844],[1280,720],[320,568],[844,390],[390,844]]){
  const result=JSON.parse(context.run(w,h));
  assert.equal(result.count,2,'four plates require two path builds in this cycle');
  assert.equal(result.actual.length,4);
  assert.deepEqual(result.actual,result.expected);
 }
});
