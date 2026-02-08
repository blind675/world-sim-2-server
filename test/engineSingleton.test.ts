import {
  startEngine,
  restoreAndStartEngine,
  stopEngine,
  getActiveEngine,
  isEngineRunning,
  _resetEngineSingleton,
  type EngineLoopConfig,
} from '../src/engine';

const DEFAULT_CONFIG: EngineLoopConfig = {
  dtGameStepSeconds: 60,
  realStepIntervalSeconds: 2,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  _resetEngineSingleton();
});

afterEach(() => {
  _resetEngineSingleton();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('startEngine', () => {
  it('should create and start an engine loop', () => {
    const engine = startEngine(DEFAULT_CONFIG);
    expect(engine).toBeDefined();
    expect(engine.isRunning()).toBe(true);
  });

  it('should set the active engine', () => {
    const engine = startEngine(DEFAULT_CONFIG);
    expect(getActiveEngine()).toBe(engine);
  });

  it('should report isEngineRunning as true', () => {
    startEngine(DEFAULT_CONFIG);
    expect(isEngineRunning()).toBe(true);
  });

  it('should throw if called while an engine is already running', () => {
    startEngine(DEFAULT_CONFIG);

    expect(() => startEngine(DEFAULT_CONFIG)).toThrow(
      'An engine loop is already running'
    );
  });

  it('should throw with restart-only message', () => {
    startEngine(DEFAULT_CONFIG);

    expect(() => startEngine(DEFAULT_CONFIG)).toThrow(
      'restart-only'
    );
  });

  it('should throw even if called with different config', () => {
    startEngine(DEFAULT_CONFIG);

    expect(() => startEngine({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 10, // different interval
    })).toThrow('An engine loop is already running');
  });

  it('should tick normally after start', () => {
    const engine = startEngine(DEFAULT_CONFIG);

    jest.advanceTimersByTime(2000); // 1 tick
    expect(engine.getStepNumber()).toBe(1);
    expect(engine.getGameTime().totalMinutes).toBe(1);
  });
});

describe('stopEngine', () => {
  it('should stop the active engine', () => {
    startEngine(DEFAULT_CONFIG);
    stopEngine();

    expect(isEngineRunning()).toBe(false);
    expect(getActiveEngine()).toBeNull();
  });

  it('should be a no-op if no engine is running', () => {
    expect(() => stopEngine()).not.toThrow();
    expect(getActiveEngine()).toBeNull();
  });

  it('should allow starting a new engine after stop', () => {
    startEngine(DEFAULT_CONFIG);
    stopEngine();

    const engine2 = startEngine(DEFAULT_CONFIG);
    expect(engine2.isRunning()).toBe(true);
    expect(isEngineRunning()).toBe(true);
  });

  it('should allow starting with different config after stop (simulating restart)', () => {
    startEngine(DEFAULT_CONFIG);
    stopEngine();

    const engine2 = startEngine({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 5, // different config
    });
    expect(engine2.isRunning()).toBe(true);
  });
});

describe('restoreAndStartEngine', () => {
  it('should restore and start an engine from state', () => {
    const engine = restoreAndStartEngine(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 500 },
      stepNumber: 500,
      accumulators: {},
    });

    expect(engine.isRunning()).toBe(true);
    expect(engine.getGameTime().totalMinutes).toBe(500);
    expect(engine.getStepNumber()).toBe(500);
    expect(getActiveEngine()).toBe(engine);
  });

  it('should throw if an engine is already running', () => {
    startEngine(DEFAULT_CONFIG);

    expect(() => restoreAndStartEngine(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 0 },
      stepNumber: 0,
      accumulators: {},
    })).toThrow('An engine loop is already running');
  });

  it('should continue ticking from restored state', () => {
    const engine = restoreAndStartEngine(DEFAULT_CONFIG, {
      gameTime: { totalMinutes: 100 },
      stepNumber: 100,
      accumulators: {},
    });

    jest.advanceTimersByTime(4000); // 2 ticks
    expect(engine.getStepNumber()).toBe(102);
    expect(engine.getGameTime().totalMinutes).toBe(102);
  });
});

describe('getActiveEngine', () => {
  it('should return null when no engine is running', () => {
    expect(getActiveEngine()).toBeNull();
  });

  it('should return the active engine', () => {
    const engine = startEngine(DEFAULT_CONFIG);
    expect(getActiveEngine()).toBe(engine);
  });

  it('should return null after stopEngine', () => {
    startEngine(DEFAULT_CONFIG);
    stopEngine();
    expect(getActiveEngine()).toBeNull();
  });
});

describe('isEngineRunning', () => {
  it('should return false initially', () => {
    expect(isEngineRunning()).toBe(false);
  });

  it('should return true after startEngine', () => {
    startEngine(DEFAULT_CONFIG);
    expect(isEngineRunning()).toBe(true);
  });

  it('should return false after stopEngine', () => {
    startEngine(DEFAULT_CONFIG);
    stopEngine();
    expect(isEngineRunning()).toBe(false);
  });
});

describe('_resetEngineSingleton', () => {
  it('should stop and clear the active engine', () => {
    startEngine(DEFAULT_CONFIG);
    _resetEngineSingleton();

    expect(getActiveEngine()).toBeNull();
    expect(isEngineRunning()).toBe(false);
  });

  it('should allow starting a new engine after reset', () => {
    startEngine(DEFAULT_CONFIG);
    _resetEngineSingleton();

    const engine = startEngine(DEFAULT_CONFIG);
    expect(engine.isRunning()).toBe(true);
  });
});

describe('restart-only enforcement scenario', () => {
  it('should enforce full stop-then-start cycle to change config', () => {
    // Start with 2s interval (30x acceleration)
    const engine1 = startEngine({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 2,
    });
    expect(engine1.isRunning()).toBe(true);

    // Cannot change to 5s interval while running
    expect(() => startEngine({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 5,
    })).toThrow();

    // Must stop first
    stopEngine();
    expect(isEngineRunning()).toBe(false);

    // Now can start with new config
    const engine2 = startEngine({
      dtGameStepSeconds: 60,
      realStepIntervalSeconds: 5,
    });
    expect(engine2.isRunning()).toBe(true);
  });
});
