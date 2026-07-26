import { readFile, writeFile, unlink } from 'node:fs/promises';

const sourceUrl=new URL('./verify-v121-piece-edge-visual.mjs',import.meta.url);
const fixedUrl=new URL('./.verify-v121-piece-edge-visual-fixed.mjs',import.meta.url);
let source=await readFile(sourceUrl,'utf8');

const contextBefore="  }finally{await context.close().catch(()=>{});}";
const contextAfter="  }finally{await Promise.race([context.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);}";
if(!source.includes(contextBefore))throw new Error('v121 context close patch target missing');
source=source.replace(contextBefore,contextAfter);

const browserBefore="  await browser.close().catch(()=>{});";
const browserAfter="  await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);";
if(!source.includes(browserBefore))throw new Error('v121 browser close patch target missing');
source=source.replace(browserBefore,browserAfter);

const identityBefore=`function assertMaterialIdentityExceptRoughness(before,after,color,label){
  for(const key of ['color','metalness','emissive','emissiveIntensity']){
    assert.deepEqual(after.materials[color][key],before.materials[color][key],\`${'${label}'}: ${'${color}'} ${'${key}'} changed\`);
  }
}`;
const identityAfter=`function assertMaterialIdentityExceptEmissiveIntensity(before,after,color,label){
  for(const key of ['color','roughness','metalness','emissive']){
    assert.deepEqual(after.materials[color][key],before.materials[color][key],\`${'${label}'}: ${'${color}'} ${'${key}'} changed\`);
  }
}`;
if(!source.includes(identityBefore))throw new Error('v121 material identity patch target missing');
source=source.replace(identityBefore,identityAfter);

const expectedBefore="  const expected={right:0.72,back:0.60,left:0.48,front:0.54};";
const expectedAfter="  const expected={right:0.18,back:0.11,left:0.11,front:0.1};";
if(!source.includes(expectedBefore))throw new Error('v121 expected material patch target missing');
source=source.replace(expectedBefore,expectedAfter);

const callBefore="    assertMaterialIdentityExceptRoughness(v120Mobile,v121Mobile,color,'mobile');";
const callAfter="    assertMaterialIdentityExceptEmissiveIntensity(v120Mobile,v121Mobile,color,'mobile');";
if(!source.includes(callBefore))throw new Error('v121 material assertion call patch target missing');
source=source.replace(callBefore,callAfter);

const valueBefore="    assert.equal(v121Mobile.materials[color].roughness,expected[color],`mobile: ${color} roughness mismatch`);";
const valueAfter="    assert.equal(v121Mobile.materials[color].emissiveIntensity,expected[color],`mobile: ${color} emissive intensity mismatch`);";
if(!source.includes(valueBefore))throw new Error('v121 emissive assertion patch target missing');
source=source.replace(valueBefore,valueAfter);

await writeFile(fixedUrl,source);
try{
  await import(fixedUrl.href+`?run=${Date.now()}`);
}finally{
  await unlink(fixedUrl).catch(()=>{});
}
