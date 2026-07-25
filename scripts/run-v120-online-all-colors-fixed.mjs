import { readFile, writeFile, unlink } from 'node:fs/promises';

const sourceUrl = new URL('./verify-v120-online-all-colors.mjs', import.meta.url);
const fixedUrl = new URL('./.verify-v120-online-all-colors-fixed.mjs', import.meta.url);
const resultsUrl = new URL('../artifacts/v120-online-all-colors/results.json', import.meta.url);
let source = await readFile(sourceUrl, 'utf8');

const routeBefore = "  await page.route('**/api/rooms-v118', async route => {";
const routeAfter = "  await page.route('**/api/rooms-v118**', async route => {";
if (!source.includes(routeBefore)) throw new Error('online_route_patch_target_missing');
source = source.replace(routeBefore, routeAfter);

const fetchBefore = "    const response = await page.context().request.fetch(ROOMS_URL, {";
const fetchAfter = "    const targetUrl = new URL(ROOMS_URL);\n    targetUrl.search = new URL(request.url()).search;\n    const response = await page.context().request.fetch(targetUrl.toString(), {";
if (!source.includes(fetchBefore)) throw new Error('online_proxy_patch_target_missing');
source = source.replace(fetchBefore, fetchAfter);

await writeFile(fixedUrl, source);
try {
  await import(fixedUrl.href + `?run=${Date.now()}`);
  const result = JSON.parse(await readFile(resultsUrl, 'utf8'));
  if (result?.ok !== true) throw new Error('online_all_colors_result_not_ok');
} finally {
  await unlink(fixedUrl).catch(() => {});
}

// The browser clients intentionally run polling timers. All assertions and
// evidence are complete once results.json is validated, so terminate cleanly.
process.exit(0);
