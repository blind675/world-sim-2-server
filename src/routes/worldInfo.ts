import { Router, Request, Response } from 'express';
import { getConfig } from '../config';
import { getActiveEngine } from '../engine';
import { formatGameTime } from '../time';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const config = getConfig();
  const engine = getActiveEngine();

  if (!engine) {
    res.status(503).json({ error: 'Engine is not running' });
    return;
  }

  const gameTime = engine.getGameTime();

  res.status(200).json({
    planet: {
      radiusKm: config.planet.radiusKm,
      seed: config.planet.seed,
    },
    time: {
      dtGameStepSeconds: config.time.dtGameStepSeconds,
      realStepIntervalSeconds: config.time.realStepIntervalSeconds,
      acceleration: config.derived.acceleration,
      current: {
        stepNumber: engine.getStepNumber(),
        totalMinutes: gameTime.totalMinutes,
        minute: gameTime.minute,
        hour: gameTime.hour,
        day: gameTime.day,
        month: gameTime.month,
        year: gameTime.year,
        dayOfYear: gameTime.dayOfYear,
        totalDays: gameTime.totalDays,
        formatted: formatGameTime(gameTime),
      },
    },
    grids: {
      atmosphere: {
        size: config.grids.atmosphere.size,
        cellSizeKm: config.grids.atmosphere.cellSizeKm,
        totalCells: config.derived.atmosphereCellsTotal,
      },
      land: {
        cellSizeM: config.grids.land.cellSizeM,
        chunkCells: config.grids.land.chunkCells,
        chunkSizeKm: config.derived.landChunkSizeKm,
        chunkSizeCells: config.derived.landChunkSizeCells,
      },
    },
  });
});

export default router;
