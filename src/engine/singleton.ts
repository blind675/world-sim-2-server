/**
 * Engine singleton — enforces "restart required" for acceleration/config.
 *
 * Only one engine loop may be active at a time. Attempting to start a second
 * engine while one is running throws an error. Stopping the engine clears the
 * singleton, simulating a "restart" (the process must be restarted to change
 * time config).
 */

import { createEngineLoop, restoreEngineLoop, type EngineLoop, type EngineLoopConfig, type EngineLoopState } from './engineLoop';

// ── Module-level singleton state ────────────────────────────────────

let activeEngine: EngineLoop | null = null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create, register as singleton, and start the engine loop.
 * Throws if an engine is already running.
 */
export function startEngine(config: EngineLoopConfig): EngineLoop {
  if (activeEngine !== null && activeEngine.isRunning()) {
    throw new Error(
      'An engine loop is already running. ' +
      'Acceleration and time config are restart-only — stop the current engine or restart the process to change settings.'
    );
  }

  const engine = createEngineLoop(config);
  activeEngine = engine;
  engine.start();

  return engine;
}

/**
 * Restore an engine from serialized state, register as singleton, and start it.
 * Throws if an engine is already running.
 */
export function restoreAndStartEngine(config: EngineLoopConfig, state: EngineLoopState): EngineLoop {
  if (activeEngine !== null && activeEngine.isRunning()) {
    throw new Error(
      'An engine loop is already running. ' +
      'Acceleration and time config are restart-only — stop the current engine or restart the process to change settings.'
    );
  }

  const engine = restoreEngineLoop(config, state);
  activeEngine = engine;
  engine.start();

  return engine;
}

/**
 * Stop the active engine and clear the singleton.
 * No-op if no engine is running.
 */
export function stopEngine(): void {
  if (activeEngine !== null) {
    activeEngine.stop();
    activeEngine = null;
  }
}

/**
 * Get the currently active engine loop, or null if none is running.
 */
export function getActiveEngine(): EngineLoop | null {
  return activeEngine;
}

/**
 * Check whether an engine is currently active and running.
 */
export function isEngineRunning(): boolean {
  return activeEngine !== null && activeEngine.isRunning();
}

/**
 * Reset singleton state. Intended for testing only.
 * @internal
 */
export function _resetEngineSingleton(): void {
  if (activeEngine !== null) {
    activeEngine.stop();
    activeEngine = null;
  }
}
