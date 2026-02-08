import {
  createEngineLoop,
  restoreEngineLoop,
  type StepContext,
  type EngineLoopConfig,
} from '../src/engine';
import { MINUTES_PER_HOUR } from '../src/time';

const DEFAULT_CONFIG: EngineLoopConfig = {
  dtGameStepSeconds: 60,
  realStepIntervalSeconds: 2,
};

// Use fake timers so tests don't wait for real wall-clock delays
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => { });
  jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createEngineLoop', () => {
  it('should create a loop with initial state at time zero', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    expect(loop.getGameTime().totalMinutes).toBe(0);
    expect(loop.getStepNumber()).toBe(0);
    expect(loop.isRunning()).toBe(false);
  });

  it('should create a loop with custom initial state', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 1000 },
      stepNumber: 50,
      accumulators: {},
    });
    expect(loop.getGameTime().totalMinutes).toBe(1000);
    expect(loop.getStepNumber()).toBe(50);
  });
});

describe('start / stop', () => {
  it('should set isRunning to true after start', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();
    expect(loop.isRunning()).toBe(true);
    loop.stop();
  });

  it('should set isRunning to false after stop', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();
    loop.stop();
    expect(loop.isRunning()).toBe(false);
  });

  it('start should be idempotent', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();
    loop.start(); // second call is no-op
    expect(loop.isRunning()).toBe(true);
    loop.stop();
  });

  it('stop should be idempotent', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.stop(); // no-op when not running
    expect(loop.isRunning()).toBe(false);
  });
});

describe('tick execution', () => {
  it('should advance game time by 1 minute per tick', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();

    // Advance past the first interval (2000ms)
    jest.advanceTimersByTime(2000);

    expect(loop.getStepNumber()).toBe(1);
    expect(loop.getGameTime().totalMinutes).toBe(1);
    expect(loop.getGameTime().minute).toBe(1);

    loop.stop();
  });

  it('should advance multiple steps over time', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();

    // 5 intervals = 5 steps
    jest.advanceTimersByTime(10000);

    expect(loop.getStepNumber()).toBe(5);
    expect(loop.getGameTime().totalMinutes).toBe(5);

    loop.stop();
  });

  it('should advance 60 steps to reach 1 hour', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();

    // 60 steps × 2000ms = 120000ms
    jest.advanceTimersByTime(120000);

    expect(loop.getStepNumber()).toBe(60);
    expect(loop.getGameTime().totalMinutes).toBe(60);
    expect(loop.getGameTime().hour).toBe(1);
    expect(loop.getGameTime().minute).toBe(0);

    loop.stop();
  });

  it('should not tick after stop', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();

    jest.advanceTimersByTime(2000); // 1 tick
    expect(loop.getStepNumber()).toBe(1);

    loop.stop();

    jest.advanceTimersByTime(10000); // would be 5 more ticks
    expect(loop.getStepNumber()).toBe(1); // still 1
  });
});

describe('handler registry', () => {
  it('should call registered handler on each tick', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const calls: StepContext[] = [];

    loop.registerHandler('test', (ctx) => {
      calls.push(ctx);
    });

    loop.start();
    jest.advanceTimersByTime(4000); // 2 ticks

    expect(calls).toHaveLength(2);
    expect(calls[0].stepNumber).toBe(1);
    expect(calls[0].gameTime.totalMinutes).toBe(1);
    expect(calls[1].stepNumber).toBe(2);
    expect(calls[1].gameTime.totalMinutes).toBe(2);

    loop.stop();
  });

  it('should call multiple handlers in registration order', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const order: string[] = [];

    loop.registerHandler('first', () => order.push('first'));
    loop.registerHandler('second', () => order.push('second'));
    loop.registerHandler('third', () => order.push('third'));

    loop.start();
    jest.advanceTimersByTime(2000); // 1 tick

    expect(order).toEqual(['first', 'second', 'third']);

    loop.stop();
  });

  it('should throw when registering a duplicate handler name', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.registerHandler('dup', () => { });

    expect(() => loop.registerHandler('dup', () => { })).toThrow(
      'Handler "dup" is already registered'
    );
  });

  it('should unregister handler via returned function', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const calls: number[] = [];

    const unregister = loop.registerHandler('removable', (ctx) => {
      calls.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000); // tick 1
    expect(calls).toEqual([1]);

    unregister();

    jest.advanceTimersByTime(2000); // tick 2
    expect(calls).toEqual([1]); // not called again

    loop.stop();
  });

  it('should continue running if a handler throws', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const goodCalls: number[] = [];

    loop.registerHandler('bad', () => {
      throw new Error('handler error');
    });
    loop.registerHandler('good', (ctx) => {
      goodCalls.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(4000); // 2 ticks

    // Good handler still called despite bad handler throwing
    expect(goodCalls).toEqual([1, 2]);
    // Loop still running
    expect(loop.isRunning()).toBe(true);
    expect(loop.getStepNumber()).toBe(2);

    loop.stop();
  });

  it('should provide frozen StepContext to handlers', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    let capturedCtx: StepContext | null = null;

    loop.registerHandler('freeze-check', (ctx) => {
      capturedCtx = ctx;
    });

    loop.start();
    jest.advanceTimersByTime(2000);
    loop.stop();

    expect(capturedCtx).not.toBeNull();
    expect(Object.isFrozen(capturedCtx)).toBe(true);
  });

  it('should provide correct dtGameStepSeconds in context', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    let capturedDt: number | null = null;

    loop.registerHandler('dt-check', (ctx) => {
      capturedDt = ctx.dtGameStepSeconds;
    });

    loop.start();
    jest.advanceTimersByTime(2000);
    loop.stop();

    expect(capturedDt).toBe(60);
  });
});

describe('serialization', () => {
  it('should serialize current state', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.start();
    jest.advanceTimersByTime(6000); // 3 ticks
    loop.stop();

    const state = loop.serialize();
    expect(state.stepNumber).toBe(3);
    expect(state.gameTime.totalMinutes).toBe(3);
  });

  it('should serialize initial state when no ticks have occurred', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const state = loop.serialize();
    expect(state.stepNumber).toBe(0);
    expect(state.gameTime.totalMinutes).toBe(0);
  });
});

describe('restoreEngineLoop', () => {
  it('should restore from serialized state', () => {
    const loop = restoreEngineLoop(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 500 },
      stepNumber: 500,
      accumulators: {},
    });

    expect(loop.getGameTime().totalMinutes).toBe(500);
    expect(loop.getStepNumber()).toBe(500);
  });

  it('should continue ticking from restored state', () => {
    const loop = restoreEngineLoop(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 100 },
      stepNumber: 100,
      accumulators: {},
    });

    loop.start();
    jest.advanceTimersByTime(4000); // 2 ticks

    expect(loop.getStepNumber()).toBe(102);
    expect(loop.getGameTime().totalMinutes).toBe(102);

    loop.stop();
  });

  it('should roundtrip serialize → restore', () => {
    const original = createEngineLoop(DEFAULT_CONFIG);
    original.start();
    jest.advanceTimersByTime(10000); // 5 ticks
    original.stop();

    const state = original.serialize();
    const restored = restoreEngineLoop(DEFAULT_CONFIG, state);

    expect(restored.getGameTime().totalMinutes).toBe(original.getGameTime().totalMinutes);
    expect(restored.getStepNumber()).toBe(original.getStepNumber());
  });
});

describe('different configurations', () => {
  it('should work with 1-second real interval', () => {
    const loop = createEngineLoop({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 1,
    });

    loop.start();
    jest.advanceTimersByTime(5000); // 5 ticks at 1s interval

    expect(loop.getStepNumber()).toBe(5);
    expect(loop.getGameTime().totalMinutes).toBe(5);

    loop.stop();
  });

  it('should work with 60-second real interval', () => {
    const loop = createEngineLoop({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 60,
    });

    loop.start();
    jest.advanceTimersByTime(120000); // 2 ticks at 60s interval

    expect(loop.getStepNumber()).toBe(2);
    expect(loop.getGameTime().totalMinutes).toBe(2);

    loop.stop();
  });
});

// ── Accumulator Scheduler Tests ─────────────────────────────────────

describe('accumulator scheduler', () => {
  it('should fire system when accumulator reaches cadence', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fires: number[] = [];

    // cadence = 300s = 5 minutes. With dtGameStep=60s, fires every 5 ticks.
    loop.registerSystem('atmo', 300, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 10); // 10 ticks
    loop.stop();

    // Should fire at tick 5 (acc: 60,120,180,240,300→fire) and tick 10
    expect(fires).toEqual([5, 10]);
  });

  it('should not fire system before cadence is reached', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fires: number[] = [];

    loop.registerSystem('slow', 600, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 9); // 9 ticks = 540s accumulated
    loop.stop();

    expect(fires).toEqual([]); // 540 < 600, not fired
  });

  it('should fire system exactly at cadence boundary', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fires: number[] = [];

    // cadence = 60s = 1 step. Should fire every tick.
    loop.registerSystem('every-tick', 60, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 3); // 3 ticks
    loop.stop();

    expect(fires).toEqual([1, 2, 3]);
  });

  it('should carry over remainder when cadence does not divide evenly', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fires: number[] = [];

    // cadence = 150s. With dtGameStep=60s:
    // tick 1: acc=60, tick 2: acc=120, tick 3: acc=180 >= 150 → fire, remainder=30
    // tick 4: acc=90, tick 5: acc=150 >= 150 → fire, remainder=0
    // tick 6: acc=60, tick 7: acc=120, tick 8: acc=180 >= 150 → fire, remainder=30
    loop.registerSystem('odd-cadence', 150, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 8); // 8 ticks
    loop.stop();

    expect(fires).toEqual([3, 5, 8]);
  });

  it('should run multiple systems independently', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fastFires: number[] = [];
    const slowFires: number[] = [];

    loop.registerSystem('fast', 120, (ctx) => fastFires.push(ctx.stepNumber)); // every 2 ticks
    loop.registerSystem('slow', 300, (ctx) => slowFires.push(ctx.stepNumber)); // every 5 ticks

    loop.start();
    jest.advanceTimersByTime(2000 * 10); // 10 ticks
    loop.stop();

    expect(fastFires).toEqual([2, 4, 6, 8, 10]);
    expect(slowFires).toEqual([5, 10]);
  });

  it('should throw on invalid cadenceSeconds', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);

    expect(() => loop.registerSystem('bad', 0, () => { })).toThrow();
    expect(() => loop.registerSystem('bad', -1, () => { })).toThrow();
    expect(() => loop.registerSystem('bad', Infinity, () => { })).toThrow();
    expect(() => loop.registerSystem('bad', NaN, () => { })).toThrow();
  });

  it('should unregister system via returned function', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const fires: number[] = [];

    const unregister = loop.registerSystem('removable', 120, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 2); // 2 ticks → fires at tick 2
    expect(fires).toEqual([2]);

    unregister();

    jest.advanceTimersByTime(2000 * 2); // 2 more ticks → would fire at tick 4
    expect(fires).toEqual([2]); // not called again

    loop.stop();
  });

  it('should continue running if a system handler throws', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const goodFires: number[] = [];

    loop.registerSystem('bad-sys', 60, () => {
      throw new Error('system error');
    });
    loop.registerSystem('good-sys', 60, (ctx) => {
      goodFires.push(ctx.stepNumber);
    });

    loop.start();
    jest.advanceTimersByTime(2000 * 3); // 3 ticks
    loop.stop();

    expect(goodFires).toEqual([1, 2, 3]);
    expect(loop.isRunning()).toBe(false); // we stopped it
    expect(loop.getStepNumber()).toBe(3);
  });

  it('should run per-tick handlers before cadenced systems', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const order: string[] = [];

    loop.registerHandler('handler', () => order.push('handler'));
    loop.registerSystem('system', 60, () => order.push('system'));

    loop.start();
    jest.advanceTimersByTime(2000); // 1 tick
    loop.stop();

    expect(order).toEqual(['handler', 'system']);
  });
});

describe('accumulator serialization', () => {
  it('should serialize accumulator state', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.registerSystem('atmo', 300, () => { });

    loop.start();
    jest.advanceTimersByTime(2000 * 3); // 3 ticks = 180s accumulated
    loop.stop();

    const state = loop.serialize();
    expect(state.accumulators).toEqual({
      atmo: { accumulated: 180, cadenceSeconds: 300 },
    });
  });

  it('should serialize empty accumulators when no systems registered', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    const state = loop.serialize();
    expect(state.accumulators).toEqual({});
  });

  it('should serialize remainder after fire', () => {
    const loop = createEngineLoop(DEFAULT_CONFIG);
    loop.registerSystem('atmo', 150, () => { });

    loop.start();
    // tick 1: 60, tick 2: 120, tick 3: 180 >= 150 → fire, remainder=30
    jest.advanceTimersByTime(2000 * 3);
    loop.stop();

    const state = loop.serialize();
    expect(state.accumulators.atmo.accumulated).toBe(30);
  });

  it('should restore accumulator state and continue correctly', () => {
    // Simulate: atmo system with cadence 300s, already accumulated 240s
    const loop = restoreEngineLoop(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 100 },
      stepNumber: 100,
      accumulators: {
        atmo: { accumulated: 240, cadenceSeconds: 300 },
      },
    });

    const fires: number[] = [];
    loop.registerSystem('atmo', 300, (ctx) => {
      fires.push(ctx.stepNumber);
    });

    loop.start();
    // tick 101: acc = 240 + 60 = 300 >= 300 → fire, remainder=0
    jest.advanceTimersByTime(2000);
    expect(fires).toEqual([101]);

    loop.stop();
  });

  it('should roundtrip serialize → restore with accumulators', () => {
    const original = createEngineLoop(DEFAULT_CONFIG);
    original.registerSystem('atmo', 300, () => { });
    original.registerSystem('land', 600, () => { });

    original.start();
    jest.advanceTimersByTime(2000 * 7); // 7 ticks = 420s
    original.stop();

    const state = original.serialize();
    // atmo: 420s → fired at 300, remainder = 120
    // land: 420s → not fired (< 600)
    expect(state.accumulators.atmo.accumulated).toBe(120);
    expect(state.accumulators.land.accumulated).toBe(420);

    const restored = restoreEngineLoop(DEFAULT_CONFIG, state);
    const atmoFires: number[] = [];
    const landFires: number[] = [];
    restored.registerSystem('atmo', 300, (ctx) => atmoFires.push(ctx.stepNumber));
    restored.registerSystem('land', 600, (ctx) => landFires.push(ctx.stepNumber));

    restored.start();
    // atmo: starts at 120, needs 180 more = 3 ticks → fires at step 10
    // land: starts at 420, needs 180 more = 3 ticks → fires at step 10
    jest.advanceTimersByTime(2000 * 3);
    restored.stop();

    expect(atmoFires).toEqual([10]);
    expect(landFires).toEqual([10]);
  });
});
