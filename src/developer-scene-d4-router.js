import {resolvePreviewRequest} from './developer-d4-registry.js?v=D4-preview-contract';

const request=resolvePreviewRequest(location.search,document.baseURI);
if(!request)throw new Error(`Unknown D4 preview target: ${location.search}`);

const modules={
  base:'./developer-scene-d1-router.js?v=D4-compatible-base',
  state:'./developer-scene-d4-states.js?v=D4-preview-contract',
  variant:'./developer-scene-d4-variants.js?v=D4-preview-contract'
};
const modulePath=modules[request.previewMode];
if(!modulePath)throw new Error(`Unknown D4 preview mode: ${request.previewMode}`);
await import(modulePath);
