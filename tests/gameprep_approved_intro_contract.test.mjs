import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const intro = readFileSync(path.join(root, 'web/app/scene/approved-intro-scene.js'), 'utf8');
const boot = readFileSync(path.join(root, 'web/app/boot/local-game-boot.js'), 'utf8');

const timing = {
  matchHoldMs: 260,
  morphMs: 980,
  settleMs: 300,
  cameraOrbitMs: 1250,
  cameraHoldMs: 220,
  closedBoxDropMs: 1200,
  closedBoxHoldMs: 420,
  lidShakeMs: 550,
  lidLiftMs: 1300,
  wallDelayMs: 520,
  wallShakeMs: 280,
  wallRaise: 20,
  wallLiftMs: 360,
  wallMoveMs: 850,
  wallDropMs: 430,
};

test('GAMEPREP-003 preserves the frozen intro timing and flow', () => {
  for (const [key, value] of Object.entries(timing)) {
    assert.match(intro, new RegExp(`${key}:\\s*${value}\\b`), `${key} drifted from the frozen approved reference`);
  }
  assert.match(intro, /loading-star>star>table>camera>closed-box-drop>lid-open>setup/);
  assert.match(intro, /publishPhase\('complete'\)/);
});

test('GAMEPREP-003 owns all intro motion through THREEJS-096 only', () => {
  assert.match(intro, /createMotionController/);
  assert.match(intro, /scope:\s*'unboxing'/);
  assert.match(intro, /key:\s*'star-table-camera'/);
  assert.match(intro, /key:\s*'closed-box-drop'/);
  assert.match(intro, /key:\s*'lid-and-walls'/);
  assert.doesNotMatch(intro, /\brequestAnimationFrame\s*\(/);
  assert.doesNotMatch(intro, /\bcancelAnimationFrame\s*\(/);
  assert.doesNotMatch(intro, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(intro, /\bsetInterval\s*\(/);
  assert.doesNotMatch(intro, /new\s+(?:TWEEN|Tween|GSAP)|\.animate\s*\(/);
});

test('GAMEPREP-003 reduced motion remains on the same motion-controller path', () => {
  assert.match(intro, /matchMedia\?\.\('\(prefers-reduced-motion:\s*reduce\)'\)/);
  assert.match(intro, /reducedMotionQuery:\s*reducedMotionQuery\?\.addEventListener/);
  assert.match(intro, /reducedMotion:\s*Boolean\(reducedMotionQuery\?\.matches\)/);
});

test('GAMEPREP-003 starts the approved intro once before setup', () => {
  const guard = boot.indexOf('if (!introStarted)');
  const play = boot.indexOf('await introScene.play()');
  const setupAfterPlay = boot.indexOf('showSetup();', play);
  assert.ok(guard >= 0, 'missing once-per-page intro guard');
  assert.ok(play > guard, 'intro must play inside the once-per-page guard');
  assert.ok(setupAfterPlay > play, 'setup must not be exposed before approved intro settles');
  assert.match(boot, /createApprovedIntroLoadingStar/);
  assert.match(boot, /assetManager\.get\('ui\.loading-star'\)/);
});

test('GAMEPREP-003 uses a closed six-part shell before final post-intro snap', () => {
  assert.match(intro, /closedBoxRoot\.add\(boardAndLid\.root, playerBases\.root\)/);
  assert.match(intro, /boardAndLid\.setLidPhase\('intro-start'\)/);
  const drop = intro.indexOf("key: 'closed-box-drop'");
  const lid = intro.indexOf("key: 'lid-and-walls'");
  const finalSnap = intro.indexOf("boardAndLid.setLidPhase('post-intro')");
  assert.ok(drop >= 0 && lid > drop, 'closed-box arrival must precede lid opening');
  assert.ok(finalSnap >= 0, 'safe final state must hide the intro lid');
});

test('GAMEPREP-003 interruption and reload-safe cleanup cannot strand the scene', () => {
  assert.match(intro, /snapSetupFinal\(\)/);
  assert.match(intro, /catch \(error\)[\s\S]*snapSetupFinal\(\)/);
  assert.match(intro, /motion\.release\(\)/);
  assert.match(boot, /introScene\?\.release\(\)/);
  assert.match(boot, /introScene\?\.snapSetupFinal\?\.\(\)/);
});
