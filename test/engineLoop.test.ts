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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
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
    loop.registerHandler('dup', () => {});

    expect(() => loop.registerHandler('dup', () => {})).toThrow(
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
    });

    expect(loop.getGameTime().totalMinutes).toBe(500);
    expect(loop.getStepNumber()).toBe(500);
  });

  it('should continue ticking from restored state', () => {
    const loop = restoreEngineLoop(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 100 },
      stepNumber: 100,
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
