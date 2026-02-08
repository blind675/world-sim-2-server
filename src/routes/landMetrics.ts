import { Router, Request, Response } from 'express';
import { getWorld } from '../world';
import { computeResidentMetrics, createDefaultMetricsConfig } from '../land';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const world = getWorld();

  if (!world) {
    res.status(503).json({ error: 'World is not initialized' });
    return;
  }

  // Optional: load a sample of chunks to populate the cache for demonstration.
  // Usage: /api/land-metrics?loadSample=9  (loads a 3x3 grid of chunks around center)
  const loadSample = parseInt(req.query.loadSample as string, 10);
  if (loadSample > 0) {
    const mgr = world.chunkManager;
    const side = Math.ceil(Math.sqrt(loadSample));
    const startCx = Math.floor(mgr.worldChunksX / 2) - Math.floor(side / 2);
    const startCy = Math.floor(mgr.worldChunksY / 2) - Math.floor(side / 2);
    let loaded = 0;
    for (let dy = 0; dy < side && loaded < loadSample; dy++) {
      for (let dx = 0; dx < side && loaded < loadSample; dx++) {
        mgr.getChunk(startCx + dx, startCy + dy);
        loaded++;
      }
    }
  }

  const config = createDefaultMetricsConfig();
  const metrics = computeResidentMetrics(world.chunkManager, config);

  const cacheStats = world.chunkManager.getStats();

  res.status(200).json({
    metrics: {
      totalCells: metrics.totalCells,
      landCells: metrics.landCells,
      oceanCells: metrics.oceanCells,
      wetLandCells: metrics.wetLandCells,
      riverCells: metrics.riverCells,
      puddleCells: metrics.puddleCells,
      waterCoveragePercent: +(metrics.waterCoverage * 100).toFixed(2),
      landWaterVolumeM: +metrics.landWaterVolumeM.toFixed(4),
      oceanWaterVolumeM: +metrics.oceanWaterVolumeM.toFixed(4),
      maxRunoffFlux: +metrics.maxRunoffFlux.toFixed(4),
    },
    cache: {
      residentChunks: cacheStats.residentCount,
      totalAccesses: cacheStats.totalAccesses,
      cacheHits: cacheStats.cacheHits,
      cacheMisses: cacheStats.cacheMisses,
      evictions: cacheStats.evictions,
    },
  });
});

export default router;
