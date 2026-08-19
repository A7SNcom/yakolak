#!/usr/bin/env node

import {
  FLASH_DIAGNOSTIC_CONTRACT,
  FLASH_DIAGNOSTIC_LABEL,
  runFlashDiagnostics,
} from '../tests/fixtures/threejs_flash_fixtures.mjs';

function summarizeState(state) {
  if (!state) return null;
  return {
    revision: state.revision,
    round: state.round,
    phase: state.lifecycle?.phase ?? null,
    interrupt: state.lifecycle?.interrupt ?? null,
    presentationGeneration: state.lifecycle?.presentationGeneration ?? null,
    activeSeatId: state.activeSeatId ?? null,
    winner: state.winner ?? null,
    draw: Boolean(state.draw),
    matchComplete: Boolean(state.matchComplete),
  };
}

function resultSummary(result) {
  const payload = result.payload;
  return {
    label: result.label,
    diagnosticOnly: result.diagnosticOnly,
    authoritativeOnline: result.authoritativeOnline,
    networkCapability: result.networkCapability,
    scenarios: {
      setup: summarizeState(payload.setup.payload.state),
      seatCounts: payload.seatCounts.map(fixture => ({
        name: fixture.name,
        configuredSeats: fixture.payload.state.seats.length,
        state: summarizeState(fixture.payload.state),
      })),
      nearWin: {
        outcome: payload.nearWin.payload.outcome,
        state: summarizeState(payload.nearWin.payload.snapshot),
      },
      draw: {
        outcome: payload.draw.payload.outcome,
        state: summarizeState(payload.draw.payload.snapshot),
      },
      timeout: {
        outcome: payload.timeout.payload.outcome,
        state: summarizeState(payload.timeout.payload.snapshot),
      },
      reconnect: {
        interrupted: summarizeState(payload.reconnect.payload.interrupted),
        recovered: summarizeState(payload.reconnect.payload.recovered),
      },
      matchEnd: summarizeState(payload.matchEnd.payload.matchEndSnapshot),
      webglRecovery: {
        interrupted: summarizeState(payload.webglRecovery.payload.interrupted),
        recovered: summarizeState(payload.webglRecovery.payload.recovered),
      },
    },
  };
}

if (
  FLASH_DIAGNOSTIC_CONTRACT.authoritativeOnline !== false
  || FLASH_DIAGNOSTIC_CONTRACT.networkCapability !== 'none'
  || FLASH_DIAGNOSTIC_CONTRACT.roomMutationCapability !== 'none'
  || FLASH_DIAGNOSTIC_CONTRACT.pagesArtifactAllowed !== false
) {
  throw new Error('FLASH diagnostics safety contract drifted');
}

console.log(`=== ${FLASH_DIAGNOSTIC_LABEL} ===`);
console.log('Repository/manual-only deterministic diagnostics. No live-room/network capability.');

const result = await runFlashDiagnostics();
console.log(JSON.stringify(resultSummary(result), null, 2));
console.log('THREEJS-043 FLASH diagnostics: PASS');
