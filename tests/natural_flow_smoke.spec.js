import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage'
    ]
  }
});

async function openFastSetup(page) {
  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          document.body.dataset.yakolakSetupFlowStage === 'entry' &&
          typeof window.yakolakTestSetupFlowAction === 'function',
    null,
    { timeout: 60000 }
  );
}

async function runTwoPlayerBotSetupToLearningDecision(page) {
  await page.evaluate(() => window.yakolakTestSetupFlowAction('new'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'count');

  await page.evaluate(() => window.yakolakTestSetupFlowAction('count', 2));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'mode:1');

  await page.evaluate(() => window.yakolakTestSetupFlowAction('mode', 1, 'bot'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'rounds');

  await page.evaluate(() => window.yakolakTestSetupFlowAction('rounds', 3));
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetupFlowStage === 'color' &&
          document.body.dataset.yakolakSetupRounds === '3'
  );

  await page.evaluate(() => window.yakolakTestSetupFlowAction('continue'));
  await page.waitForFunction(() => document.body.dataset.yakolakSetupFlowStage === 'knowledge');
}

test('intro naturally reaches setup and a real match', async ({ page }) => {
  test.setTimeout(420000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestShowSetup === 'function',
    null,
    { timeout: 30000 }
  );

  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible',
    null,
    { timeout: 330000 }
  );

  await page.evaluate(() => window.yakolakTestStartPassPlay());

  await page.waitForFunction(
    () => document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakCurrentPlayer === 'right' &&
          document.body.dataset.yakolakPlayers === '2',
    null,
    { timeout: 30000 }
  );

  expect(fatal).toEqual([]);
  console.log('YAKOLAK_NATURAL_FLOW_OK intro>setup>match');
});

test('experienced player gets structural decisions first and starts without tutorial detour', async ({ page }) => {
  test.setTimeout(90000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await openFastSetup(page);
  await runTwoPlayerBotSetupToLearningDecision(page);

  await page.evaluate(() => window.yakolakTestSetupFlowAction('knowledge', 'skip'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetupLearning === 'skip' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakPlayers === '2',
    null,
    { timeout: 30000 }
  );

  const snapshot = await page.evaluate(() => ({
    learning: document.body.dataset.yakolakSetupLearning,
    tutorialStage: document.body.dataset.yakolakTutorialStage || '',
    matchState: document.body.dataset.yakolakMatchState,
    players: document.body.dataset.yakolakPlayers,
    rounds: document.body.dataset.yakolakSetupRounds,
    mode: document.body.dataset.yakolakSetupMode,
  }));

  expect(snapshot.learning).toBe('skip');
  expect(['starting', 'line', 'stairs', 'tower']).not.toContain(snapshot.tutorialStage);
  expect(snapshot.matchState).toBe('turn');
  expect(snapshot.players).toBe('2');
  expect(snapshot.rounds).toBe('3');
  expect(snapshot.mode).toBe('bot');
  expect(fatal).toEqual([]);
  console.log('YAKOLAK_EXPERIENCED_JOURNEY_OK entry>count>mode>rounds>color>knowledge>match');
});

test('new player reaches the same setup then learns immediately before the real match', async ({ page }) => {
  test.setTimeout(150000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await openFastSetup(page);
  await runTwoPlayerBotSetupToLearningDecision(page);

  await page.evaluate(() => window.yakolakTestSetupFlowAction('knowledge', 'learn'));
  await page.waitForFunction(
    () => document.body.dataset.yakolakSetupLearning === 'learn' &&
          ['starting', 'line', 'stairs', 'tower'].includes(document.body.dataset.yakolakTutorialStage || ''),
    null,
    { timeout: 30000 }
  );
  await page.waitForFunction(
    () => document.body.dataset.yakolakTutorialStage === 'complete' &&
          document.body.dataset.yakolakMatchState === 'turn' &&
          document.body.dataset.yakolakPlayers === '2',
    null,
    { timeout: 90000 }
  );

  expect(await page.evaluate(() => document.body.dataset.yakolakSetupLearning)).toBe('learn');
  expect(await page.evaluate(() => document.body.dataset.yakolakTutorialExperience)).toBe('spectator-three-demo');
  expect(fatal).toEqual([]);
  console.log('YAKOLAK_NEW_PLAYER_JOURNEY_OK entry>count>mode>rounds>color>knowledge>tutorial>match');
});

test('completed match rematches three times in one runtime with zero stale state', async ({ page }) => {
  test.setTimeout(130000);
  const fatal = [];
  page.on('pageerror', error => fatal.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    console.log(`[browser:${message.type()}] ${text}`);
    if (message.type() === 'error' && !text.includes('favicon')) fatal.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:8000/?yakolakTestFast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.yakolakIntro === 'complete' &&
          document.body.dataset.yakolakSetup === 'visible' &&
          typeof window.yakolakTestStartPassPlay === 'function' &&
          typeof window.yakolakTestRunRematchLifecycle === 'function',
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => {
    window.__yakolakRematchRuntimeToken = `runtime-${Date.now()}-${Math.random()}`;
    window.yakolakTestStartPassPlay();
  });
  await page.waitForFunction(
    () => document.body.dataset.yakolakGameplay === 'ready' &&
          document.body.dataset.yakolakCurrentPlayer === 'right',
    null,
    { timeout: 20000 }
  );

  const runtimeToken = await page.evaluate(() => window.__yakolakRematchRuntimeToken);
  await page.evaluate(() => window.yakolakTestRunRematchLifecycle());
  await page.waitForFunction(
    () => ['passed', 'failed'].includes(document.body.dataset.yakolakRematchLifecycle || ''),
    null,
    { timeout: 10000 }
  );

  const snapshot = await page.evaluate(() => ({
    result: document.body.dataset.yakolakRematchLifecycle,
    cycles: document.body.dataset.yakolakRematchCycles,
    failures: document.body.dataset.yakolakRematchFailures,
    currentPlayer: document.body.dataset.yakolakCurrentPlayer,
    round: document.body.dataset.yakolakRound,
    winner: document.body.dataset.yakolakWinner,
    selected: document.body.dataset.yakolakSelected,
    moves: Number(document.body.dataset.yakolakMoves),
    scoreMarkers: Number(document.body.dataset.yakolakScoreMarkers),
    played: Number(document.body.dataset.yakolakResiduePlayed),
    occupied: Number(document.body.dataset.yakolakResidueOccupied),
    stray: Number(document.body.dataset.yakolakResidueStray),
    runtimeToken: window.__yakolakRematchRuntimeToken
  }));

  expect(snapshot).toEqual({
    result: 'passed',
    cycles: '3',
    failures: '',
    currentPlayer: 'right',
    round: '1',
    winner: '',
    selected: '',
    moves: 0,
    scoreMarkers: 0,
    played: 0,
    occupied: 0,
    stray: 0,
    runtimeToken
  });
  expect(fatal).toEqual([]);
  console.log('YAKOLAK_REMATCH_CLEAN_OK cycles=3 same-runtime winner=empty turn=right moves=0 scores=0 residue=0');
});
