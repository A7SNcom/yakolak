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

await writeFile(fixedUrl,source);
try{
  await import(fixedUrl.href+`?run=${Date.now()}`);
}finally{
  await unlink(fixedUrl).catch(()=>{});
}
