/**
 * EngineLoop — Self-correcting deterministic simulation step loop.
 *
 * Each tick:
 *   1. Advances GameTime by Δt_game_step seconds (60s = 1 in-game minute)
 *   2. Calls all registered step handlers in order
 *   3. Schedules next tick, compensating for execution time
 *
 * Configuration is read once at creation (restart-only).
 */

import {
  type GameTime,
  createGameTime,
  advanceTime,
  formatGameTime,
  serializeGameTime,
  deserializeGameTime,
  type GameTimeState,
} from '../time';

// ── Types ───────────────────────────────────────────────────────────

export interface StepContext {
  /** Current game time (after this step's advance) */
  readonly gameTime: GameTime;
  /** Engine step number (0-indexed, increments each tick) */
  readonly stepNumber: number;
  /** Δt_game_step in seconds */
  readonly dtGameStepSeconds: number;
}

/**
 * A step handler is called once per engine tick.
 * Handlers run synchronously in registration order.
 */
export type StepHandler = (ctx: StepContext) => void;

export interface EngineLoopConfig {
  /** Fixed simulated time per engine step, in seconds (must be 60) */
  dtGameStepSeconds: number;
  /** Wall-clock interval between steps, in seconds */
  realStepIntervalSeconds: number;
}

export interface EngineLoopState {
  gameTime: GameTimeState;
  stepNumber: number;
}

// ── Engine Loop ─────────────────────────────────────────────────────

export interface EngineLoop {
  /** Register a step handler. Returns an unregister function. */
  registerHandler(name: string, handler: StepHandler): () => void;
  /** Start the loop. No-op if already running. */
  start(): void;
  /** Stop the loop. No-op if not running. */
  stop(): void;
  /** Whether the loop is currently running. */
  isRunning(): boolean;
  /** Current game time. */
  getGameTime(): GameTime;
  /** Current step number. */
  getStepNumber(): number;
  /** Serialize loop state for snapshots. */
  serialize(): EngineLoopState;
}

export function createEngineLoop(
  config: EngineLoopConfig,
  initialState?: EngineLoopState,
): EngineLoop {
  const { dtGameStepSeconds, realStepIntervalSeconds } = config;
  const realStepIntervalMs = realStepIntervalSeconds * 1000;

  let gameTime: GameTime = initialState
    ? deserializeGameTime(initialState.gameTime)
    : createGameTime(0);
  let stepNumber = initialState?.stepNumber ?? 0;
  let running = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const handlers: Map<string, StepHandler> = new Map();

  function tick(): void {
    const tickStart = performance.now();

    // Advance game time
    gameTime = advanceTime(gameTime, dtGameStepSeconds);
    stepNumber++;

    const ctx: StepContext = Object.freeze({
      gameTime,
      stepNumber,
      dtGameStepSeconds,
    });

    // Run all registered handlers
    for (const [name, handler] of handlers) {
      try {
        handler(ctx);
      } catch (err) {
        console.error(`[Engine] Handler "${name}" threw on step ${stepNumber}:`, err);
      }
    }

    const tickDuration = performance.now() - tickStart;

    // Basic logging
    console.log(
      `[Engine] Step ${stepNumber} | ${formatGameTime(gameTime)} | ${tickDuration.toFixed(1)}ms`
    );

    // Self-correcting schedule: subtract execution time from interval
    if (running) {
      const nextDelay = Math.max(0, realStepIntervalMs - tickDuration);
      timerId = setTimeout(tick, nextDelay);
    }
  }

  return {
    registerHandler(name: string, handler: StepHandler): () => void {
      if (handlers.has(name)) {
        throw new Error(`Handler "${name}" is already registered`);
      }
      handlers.set(name, handler);
      return () => {
        handlers.delete(name);
      };
    },

    start(): void {
      if (running) return;
      running = true;

      const acceleration = dtGameStepSeconds / realStepIntervalSeconds;
      console.log(`[Engine] Starting loop: Δt=${dtGameStepSeconds}s, interval=${realStepIntervalSeconds}s, acceleration=${acceleration.toFixed(1)}x`);
      console.log(`[Engine] Registered handlers: ${handlers.size > 0 ? [...handlers.keys()].join(', ') : '(none)'}`);

      // Schedule first tick
      timerId = setTimeout(tick, realStepIntervalMs);
    },

    stop(): void {
      if (!running) return;
      running = false;

      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      console.log(`[Engine] Stopped at step ${stepNumber} | ${formatGameTime(gameTime)}`);
    },

    isRunning(): boolean {
      return running;
    },

    getGameTime(): GameTime {
      return gameTime;
    },

    getStepNumber(): number {
      return stepNumber;
    },

    serialize(): EngineLoopState {
      return {
        gameTime: serializeGameTime(gameTime),
        stepNumber,
      };
    },
  };
}

/**
 * Restore an engine loop from serialized state.
 */
export function restoreEngineLoop(
  config: EngineLoopConfig,
  state: EngineLoopState,
): EngineLoop {
  return createEngineLoop(config, state);
}
