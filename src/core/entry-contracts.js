/**
 * @typedef {'BOOT_COMPLETED'|'OPEN_MODE_SELECTION'|'SELECT_MODE'} ActionType
 *
 * @typedef {Object} Action
 * @property {ActionType} type
 * @property {'local'|'bot'|'online'|'tutorial'} [mode]
 *
 * @typedef {'boot'|'entry'|'mode_selection'} AppPhase
 *
 * @typedef {Object} AppState
 * @property {AppPhase} phase
 * @property {'local'|'bot'|'online'|'tutorial'|null} selectedMode
 * @property {number} revision
 *
 * @typedef {'STATE_CHANGED'|'TRANSITION_REJECTED'} EffectType
 *
 * @typedef {Object} Effect
 * @property {EffectType} type
 * @property {ActionType} actionType
 * @property {AppPhase} phase
 * @property {string} [reason]
 *
 * @typedef {Object} RenderSnapshot
 * @property {AppPhase} phase
 * @property {boolean} showLoader
 * @property {boolean} showEntry
 * @property {boolean} showModeSelection
 * @property {'local'|'bot'|'online'|'tutorial'|null} selectedMode
 */

export const APP_PHASE = Object.freeze({
  BOOT: 'boot',
  ENTRY: 'entry',
  MODE_SELECTION: 'mode_selection',
});

export const ACTION = Object.freeze({
  BOOT_COMPLETED: 'BOOT_COMPLETED',
  OPEN_MODE_SELECTION: 'OPEN_MODE_SELECTION',
  SELECT_MODE: 'SELECT_MODE',
});

export const MODE = Object.freeze({
  LOCAL: 'local',
  BOT: 'bot',
  ONLINE: 'online',
  TUTORIAL: 'tutorial',
});

export const VALID_MODES = Object.freeze(new Set(Object.values(MODE)));
