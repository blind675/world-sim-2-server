import { Request, Response } from 'express';

// Mock the engine singleton module
const mockGetActiveEngine = jest.fn();
jest.mock('../src/engine', () => ({
  getActiveEngine: mockGetActiveEngine,
}));

// Mock the config module
const mockGetConfig = jest.fn();
jest.mock('../src/config', () => ({
  getConfig: mockGetConfig,
}));

// Mock the time module
jest.mock('../src/time', () => ({
  formatGameTime: jest.fn((t: any) => `Y${t.year} M${t.month} D${t.day} 00:00`),
}));

// Import routes after mocks are set up
import timeRouter from '../src/routes/time';
import worldInfoRouter from '../src/routes/worldInfo';

// Helper to simulate Express route handling
function createMockRes(): { res: Partial<Response>; statusFn: jest.Mock; jsonFn: jest.Mock } {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  return {
    res: { status: statusFn, json: jsonFn } as Partial<Response>,
    statusFn,
    jsonFn,
  };
}

function getRouteHandler(router: any): (req: Request, res: Response) => void {
  // Express Router stores routes in router.stack
  const layer = router.stack.find((l: any) => l.route && l.route.path === '/');
  return layer.route.stack[0].handle;
}

const MOCK_GAME_TIME = {
  totalMinutes: 1234,
  minute: 34,
  hour: 20,
  day: 0,
  month: 0,
  year: 0,
  dayOfYear: 0,
  totalDays: 0,
};

const MOCK_CONFIG = {
  planet: { radiusKm: 10000, seed: 42 },
  time: {
    dtGameStepSeconds: 60,
    realStepIntervalSeconds: 2,
    accelerationRestartOnly: true,
  },
  grids: {
    atmosphere: { size: 1024, cellSizeKm: 19.53125 },
    land: { cellSizeM: 250, chunkCells: 256 },
  },
  derived: {
    acceleration: 30,
    atmosphereCellsTotal: 1048576,
    landChunkSizeKm: 64,
    landChunkSizeCells: 65536,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/time', () => {
  const handler = getRouteHandler(timeRouter);

  it('should return 503 if engine is not running', () => {
    mockGetActiveEngine.mockReturnValue(null);
    const { res, statusFn, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    expect(statusFn).toHaveBeenCalledWith(503);
    expect(jsonFn).toHaveBeenCalledWith({ error: 'Engine is not running' });
  });

  it('should return current game time when engine is running', () => {
    mockGetActiveEngine.mockReturnValue({
      getGameTime: () => MOCK_GAME_TIME,
      getStepNumber: () => 1234,
    });
    const { res, statusFn, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    expect(statusFn).toHaveBeenCalledWith(200);
    const body = jsonFn.mock.calls[0][0];
    expect(body.stepNumber).toBe(1234);
    expect(body.totalMinutes).toBe(1234);
    expect(body.minute).toBe(34);
    expect(body.hour).toBe(20);
    expect(body.day).toBe(0);
    expect(body.month).toBe(0);
    expect(body.year).toBe(0);
    expect(body.dayOfYear).toBe(0);
    expect(body.totalDays).toBe(0);
    expect(body.formatted).toBeDefined();
  });

  it('should include all expected fields', () => {
    mockGetActiveEngine.mockReturnValue({
      getGameTime: () => MOCK_GAME_TIME,
      getStepNumber: () => 100,
    });
    const { res, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    const body = jsonFn.mock.calls[0][0];
    const expectedKeys = [
      'stepNumber', 'totalMinutes', 'minute', 'hour',
      'day', 'month', 'year', 'dayOfYear', 'totalDays', 'formatted',
    ];
    for (const key of expectedKeys) {
      expect(body).toHaveProperty(key);
    }
  });
});

describe('GET /api/world-info', () => {
  const handler = getRouteHandler(worldInfoRouter);

  it('should return 503 if engine is not running', () => {
    mockGetActiveEngine.mockReturnValue(null);
    const { res, statusFn, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    expect(statusFn).toHaveBeenCalledWith(503);
    expect(jsonFn).toHaveBeenCalledWith({ error: 'Engine is not running' });
  });

  it('should return full world info when engine is running', () => {
    mockGetActiveEngine.mockReturnValue({
      getGameTime: () => MOCK_GAME_TIME,
      getStepNumber: () => 500,
    });
    mockGetConfig.mockReturnValue(MOCK_CONFIG);
    const { res, statusFn, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    expect(statusFn).toHaveBeenCalledWith(200);
    const body = jsonFn.mock.calls[0][0];

    // Planet
    expect(body.planet.radiusKm).toBe(10000);
    expect(body.planet.seed).toBe(42);

    // Time config
    expect(body.time.dtGameStepSeconds).toBe(60);
    expect(body.time.realStepIntervalSeconds).toBe(2);
    expect(body.time.acceleration).toBe(30);

    // Current time
    expect(body.time.current.stepNumber).toBe(500);
    expect(body.time.current.totalMinutes).toBe(1234);
    expect(body.time.current.formatted).toBeDefined();

    // Grids
    expect(body.grids.atmosphere.size).toBe(1024);
    expect(body.grids.atmosphere.cellSizeKm).toBe(19.53125);
    expect(body.grids.atmosphere.totalCells).toBe(1048576);
    expect(body.grids.land.cellSizeM).toBe(250);
    expect(body.grids.land.chunkCells).toBe(256);
    expect(body.grids.land.chunkSizeKm).toBe(64);
    expect(body.grids.land.chunkSizeCells).toBe(65536);
  });

  it('should include all top-level sections', () => {
    mockGetActiveEngine.mockReturnValue({
      getGameTime: () => MOCK_GAME_TIME,
      getStepNumber: () => 0,
    });
    mockGetConfig.mockReturnValue(MOCK_CONFIG);
    const { res, jsonFn } = createMockRes();

    handler({} as Request, res as Response);

    const body = jsonFn.mock.calls[0][0];
    expect(body).toHaveProperty('planet');
    expect(body).toHaveProperty('time');
    expect(body).toHaveProperty('grids');
    expect(body.time).toHaveProperty('current');
    expect(body.grids).toHaveProperty('atmosphere');
    expect(body.grids).toHaveProperty('land');
  });
});
