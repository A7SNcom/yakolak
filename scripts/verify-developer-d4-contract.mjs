import assert from 'node:assert/strict';
import {
  developerDefinitions,
  definitionKey,
  variantsFor,
  contractFor,
  resolveReviewEntity,
  resolvePreviewRequest,
  previewModeFor
} from '../src/developer-d4-registry.js';

const definitionKeys=new Set();
const reviewKeys=new Set();
const comparisonKeys=new Set();
const validModes=new Set(['base','state','variant']);

for(const definition of developerDefinitions){
  const key=definitionKey(definition);
  assert(!definitionKeys.has(key),`duplicate definition key: ${key}`);
  definitionKeys.add(key);
  assert(validModes.has(previewModeFor(definition)),`invalid preview mode: ${key}`);

  const variantIds=new Set();
  for(const selectedVariant of variantsFor(definition)){
    assert(selectedVariant.id,`missing variant id: ${key}`);
    assert(!variantIds.has(selectedVariant.id),`duplicate variant id: ${key}/${selectedVariant.id}`);
    variantIds.add(selectedVariant.id);

    const contract=contractFor(definition,selectedVariant.id,'https://example.test/workspace/');
    assert.equal(contract.definition,definition);
    assert.equal(contract.variant,selectedVariant);
    assert.equal(contract.definitionKey,key);
    assert(contract.previewUrl.includes('/workspace/developer-scene.html'));
    assert(!reviewKeys.has(contract.reviewKey),`duplicate review key: ${contract.reviewKey}`);
    assert(!comparisonKeys.has(contract.comparisonKey),`duplicate comparison key: ${contract.comparisonKey}`);
    reviewKeys.add(contract.reviewKey);
    comparisonKeys.add(contract.comparisonKey);

    const url=new URL(contract.previewUrl);
    assert.equal(url.searchParams.get(definition.kind==='element'?'element':'scene'),definition.id);
    assert.equal(url.searchParams.get('variant'),selectedVariant.id);
    assert.equal(url.searchParams.get('preview'),'1');
    for(const [queryKey,queryValue] of Object.entries(selectedVariant.query||{}))assert.equal(url.searchParams.get(queryKey),String(queryValue));

    const reviewRoundTrip=resolveReviewEntity(definition.kind,contract.reviewEntityId);
    assert.equal(reviewRoundTrip?.definition,definition,`review definition round-trip failed: ${contract.reviewKey}`);
    assert.equal(reviewRoundTrip?.variant,selectedVariant,`review variant round-trip failed: ${contract.reviewKey}`);

    const previewRoundTrip=resolvePreviewRequest(url.search,'https://example.test/workspace/');
    assert.equal(previewRoundTrip?.definition,definition,`preview definition round-trip failed: ${key}`);
    assert.equal(previewRoundTrip?.variant,selectedVariant,`preview variant round-trip failed: ${key}/${selectedVariant.id}`);
  }
}

assert.equal(definitionKeys.size,developerDefinitions.length);
console.log(JSON.stringify({ok:true,definitions:definitionKeys.size,reviewKeys:reviewKeys.size,comparisonKeys:comparisonKeys.size},null,2));
