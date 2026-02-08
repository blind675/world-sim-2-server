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

/**
 * A system handler is called when its accumulator reaches the cadence threshold.
 * Receives the same StepContext as regular handlers.
 */
export type SystemHandler = (ctx: StepContext) => void;

export interface EngineLoopConfig {
  /** Fixed simulated time per engine step, in seconds (must be 60) */
  dtGameStepSeconds: number;
  /** Wall-clock interval between steps, in seconds */
  realStepIntervalSeconds: number;
}

export interface AccumulatorState {
  /** Accumulated game-seconds since last fire */
  accumulated: number;
  /** Cadence threshold in game-seconds */
  cadenceSeconds: number;
}

export interface EngineLoopState {
  gameTime: GameTimeState;
  stepNumber: number;
  accumulators: Record<string, AccumulatorState>;
}

// ── Engine Loop ─────────────────────────────────────────────────────

export interface EngineLoop {
  /** Register a step handler (called every tick). Returns an unregister function. */
  registerHandler(name: string, handler: StepHandler): () => void;
  /** Register a cadenced system. Fires when accumulator >= cadenceSeconds. Returns an unregister function. */
  registerSystem(name: string, cadenceSeconds: number, handler: SystemHandler): () => void;
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

  interface SystemEntry {
    cadenceSeconds: number;
    accumulated: number;
    handler: SystemHandler;
  }
  const systems: Map<string, SystemEntry> = new Map();

  // Restore accumulator state if provided
  if (initialState?.accumulators) {
    for (const [name, acc] of Object.entries(initialState.accumulators)) {
      // Create placeholder entries — handlers will be re-registered by the caller.
      // We store cadence and accumulated so they survive restoration.
      systems.set(name, {
        cadenceSeconds: acc.cadenceSeconds,
        accumulated: acc.accumulated,
        handler: () => { },
      });
    }
  }

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

    // Run all registered per-tick handlers
    for (const [name, handler] of handlers) {
      try {
        handler(ctx);
      } catch (err) {
        console.error(`[Engine] Handler "${name}" threw on step ${stepNumber}:`, err);
      }
    }

    // Run cadenced systems via accumulators
    for (const [name, entry] of systems) {
      entry.accumulated += dtGameStepSeconds;
      if (entry.accumulated >= entry.cadenceSeconds) {
        entry.accumulated -= entry.cadenceSeconds;
        try {
          entry.handler(ctx);
        } catch (err) {
          console.error(`[Engine] System "${name}" threw on step ${stepNumber}:`, err);
        }
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

    registerSystem(name: string, cadenceSeconds: number, handler: SystemHandler): () => void {
      if (cadenceSeconds <= 0 || !Number.isFinite(cadenceSeconds)) {
        throw new Error(`cadenceSeconds must be a positive finite number, got ${cadenceSeconds}`);
      }
      // If restoring, update the handler on the existing placeholder entry
      if (systems.has(name)) {
        const existing = systems.get(name)!;
        existing.handler = handler;
        // Keep existing cadence and accumulated from restored state
        return () => {
          systems.delete(name);
        };
      }
      systems.set(name, {
        cadenceSeconds,
        accumulated: 0,
        handler,
      });
      return () => {
        systems.delete(name);
      };
    },

    start(): void {
      if (running) return;
      running = true;

      const acceleration = dtGameStepSeconds / realStepIntervalSeconds;
      console.log(`[Engine] Starting loop: Δt=${dtGameStepSeconds}s, interval=${realStepIntervalSeconds}s, acceleration=${acceleration.toFixed(1)}x`);
      console.log(`[Engine] Registered handlers: ${handlers.size > 0 ? [...handlers.keys()].join(', ') : '(none)'}`);
      if (systems.size > 0) {
        const systemInfo = [...systems.entries()]
          .map(([n, e]) => `${n}(${e.cadenceSeconds}s)`)
          .join(', ');
        console.log(`[Engine] Registered systems: ${systemInfo}`);
      }

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
      const accumulators: Record<string, AccumulatorState> = {};
      for (const [name, entry] of systems) {
        accumulators[name] = {
          accumulated: entry.accumulated,
          cadenceSeconds: entry.cadenceSeconds,
        };
      }
      return {
        gameTime: serializeGameTime(gameTime),
        stepNumber,
        accumulators,
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
