import type { AppConfigInput } from './schema';

export const config: AppConfigInput = {
  planet: {
    radiusKm: 10000,
    seed: 42,
  },

  time: {
    dtGameStepSeconds: 60,
    realStepIntervalSeconds: 2,
    accelerationRestartOnly: true,
  },

  grids: {
    atmosphere: {
      size: 1024,
      cellSizeKm: 19.53125,
    },

    land: {
      cellSizeM: 250,
      chunkCells: 256,
    },
  },

  runtime: {
    logLevel: 'info',

    snapshots: {
      enabled: false,
      dir: './snapshots',
      intervalSteps: 100,
    },
  },
};
