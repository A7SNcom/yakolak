import { chromium } from 'playwright';

const baseUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['ready', 'failed', 'unsupported-webgl'].includes(document.documentElement.dataset.bootState));

  const result = await page.evaluate(async () => {
    const shell = window.__YAKOLAK_THREEJS_SHELL__;
    if (!shell) throw new Error('Three.js shell is missing');
    const [tapModule, intentModule, rulesModule, seatModule, stateModule] = await Promise.all([
      import('/app/gameplay/tap-click-confirmation.js'),
      import('/app/gameplay/gameplay-intent.js'),
      import('/app/shared/rules.js'),
      import('/app/shared/seat-order.js'),
      import('/app/session/canonical-session-state.js'),
    ]);
    const worldLayout = shell.getAsset('data.world-layout');
    const approvedContract = shell.getAsset('data.approved-contract');
    if (!worldLayout || !approvedContract) throw new Error('Canonical runtime data is missing');

    const seats = seatModule.configuredSeatOrder('marble', 2).map((slot, index) => ({
      seatId: slot.seatId,
      type: index === 0 ? 'human' : 'computer',
      color: slot.color,
      ready: true,
    }));
    const state = stateModule.createCanonicalSessionState({
      preferredColor: 'marble',
      targetPlayers: 2,
      winsToMatch: 3,
      seats,
      board: rulesModule.emptyBoard(),
      activeSeatId: 'right',
      deadlineAtMs: performance.now() + 60_000,
      revision: 70,
      lifecycle: { phase: 'turn-loop', presentationGeneration: 9 },
    });

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'tap metric trigger';
    trigger.style.position = 'fixed';
    trigger.style.left = '8px';
    trigger.style.bottom = '8px';
    trigger.style.width = '44px';
    trigger.style.height = '44px';
    trigger.style.opacity = '0.01';
    document.body.appendChild(trigger);

    const marker = document.createElement('div');
    marker.setAttribute('role', 'status');
    marker.style.position = 'fixed';
    marker.style.left = '8px';
    marker.style.top = '8px';
    marker.style.minWidth = '24px';
    marker.style.minHeight = '24px';
    marker.style.display = 'block';
    marker.textContent = 'idle';
    document.body.appendChild(marker);

    const processingMs = [];
    const visibleMs = [];
    const synchronous = [];
    const visibleAtFirstFrame = [];
    let sampleStart = 0;
    let expectedSequence = 0;
    let feedbackSequence = 0;
    let nextSize = 'large';

    const authority = {
      submit() { return Promise.resolve({ accepted: true }); },
      snapshot() { return Promise.resolve(state); },
    };
    const controller = tapModule.createTapClickConfirmationController({
      authority,
      intentFactory(input) {
        return intentModule.createGameplayIntent({
          ...input,
          adapter: intentModule.GAMEPLAY_AUTHORITY_ADAPTERS.LOCAL,
        });
      },
      onFeedback(snapshot, meta) {
        feedbackSequence += 1;
        marker.dataset.sequence = String(feedbackSequence);
        marker.dataset.kind = meta.kind;
        marker.dataset.size = snapshot.selection.selectedSize || '';
        marker.textContent = `${meta.kind}:${snapshot.selection.selectedSize || 'none'}`;
      },
      worldLayout,
      approvedContract,
    });

    trigger.addEventListener('pointerup', event => {
      const beforeFeedback = feedbackSequence;
      controller.tapSize({
        state,
        stackTargetId: 'stack:right:0',
        size: nextSize,
        source: intentModule.GAMEPLAY_PRESENTATION_SOURCES.TAP,
      });
      expectedSequence = beforeFeedback + 1;
      nextSize = nextSize === 'large' ? 'medium' : 'large';
    });

    // Warm the module/event/DOM path without recording startup noise.
    for (let index = 0; index < 10; index += 1) {
      trigger.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      }));
    }
    await new Promise(resolve => requestAnimationFrame(resolve));

    for (let index = 0; index < 60; index += 1) {
      const before = feedbackSequence;
      sampleStart = performance.now();
      trigger.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: index + 2, pointerType: 'touch', isPrimary: true,
      }));
      const processingEnd = performance.now();
      const expected = before + 1;
      synchronous.push(feedbackSequence === expected && marker.dataset.sequence === String(expected));
      processingMs.push(processingEnd - sampleStart);

      await new Promise(resolve => requestAnimationFrame(resolve));
      const rect = marker.getBoundingClientRect();
      const style = getComputedStyle(marker);
      visibleAtFirstFrame.push(
        marker.dataset.sequence === String(expected)
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0,
      );
      visibleMs.push(performance.now() - sampleStart);
    }

    trigger.remove();
    marker.remove();

    return {
      bootState: document.documentElement.dataset.bootState,
      sampleCount: processingMs.length,
      processingMs: {
        p50: percentile(processingMs, 0.50),
        p95: percentile(processingMs, 0.95),
        max: Math.max(...processingMs),
      },
      tapToVisibleFeedbackMs: {
        p50: percentile(visibleMs, 0.50),
        p95: percentile(visibleMs, 0.95),
        max: Math.max(...visibleMs),
      },
      synchronousFeedback: synchronous.every(Boolean),
      visibleAtFirstRenderOpportunity: visibleAtFirstFrame.every(Boolean),
      historicalProcessingP95CeilingMs: tapModule.UX_SELECT_46_PROCESSING_P95_CEILING_MS,
    };
  });

  const checks = {
    bootReady: result.bootState === 'ready',
    noPageErrors: pageErrors.length === 0,
    enoughFreshSamples: result.sampleCount === 60,
    synchronousFeedback: result.synchronousFeedback === true,
    sameRenderOpportunity: result.visibleAtFirstRenderOpportunity === true,
    historicalProcessingCeilingPreserved: result.historicalProcessingP95CeilingMs === 50
      && result.processingMs.p95 <= result.historicalProcessingP95CeilingMs,
    freshVisibleMetricsFinite: [
      result.tapToVisibleFeedbackMs.p50,
      result.tapToVisibleFeedbackMs.p95,
      result.tapToVisibleFeedbackMs.max,
    ].every(Number.isFinite),
  };

  const ok = Object.values(checks).every(Boolean);
  failed ||= !ok;
  console.log(JSON.stringify({ ok, checks, metrics: result, pageErrors }));
  await context.close();
} finally {
  await browser.close();
}

if (failed) process.exit(1);
