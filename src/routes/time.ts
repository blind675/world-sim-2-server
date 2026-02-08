import { Router, Request, Response } from 'express';
import { getActiveEngine } from '../engine';
import { formatGameTime } from '../time';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const engine = getActiveEngine();

  if (!engine) {
    res.status(503).json({ error: 'Engine is not running' });
    return;
  }

  const gameTime = engine.getGameTime();

  res.status(200).json({
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
  });
});

export default router;
