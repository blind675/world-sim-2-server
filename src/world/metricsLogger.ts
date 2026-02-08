/**
 * Metrics Logger — Cadenced system handler that logs land metrics to console.
 *
 * Register with the engine loop to get periodic metrics output.
 */

import type { StepContext } from '../engine';
import { getWorld } from './worldSingleton';
import { computeResidentMetrics, createDefaultMetricsConfig } from '../land';

const metricsConfig = createDefaultMetricsConfig();

/**
 * System handler that logs land metrics to the console.
 * Designed to be registered via engine.registerSystem().
 */
export function logLandMetrics(ctx: StepContext): void {
  const world = getWorld();
  if (!world) return;

  const m = computeResidentMetrics(world.chunkManager, metricsConfig);

  if (m.totalCells === 0) {
    console.log(`[LandMetrics] Step ${ctx.stepNumber} | No resident chunks`);
    return;
  }

  const cache = world.chunkManager.getStats();

  console.log(
    `[LandMetrics] Step ${ctx.stepNumber} | ` +
    `chunks=${cache.residentCount} | ` +
    `land=${m.landCells} ocean=${m.oceanCells} | ` +
    `wet=${m.wetLandCells} river=${m.riverCells} puddle=${m.puddleCells} | ` +
    `coverage=${(m.waterCoverage * 100).toFixed(1)}% | ` +
    `landWater=${m.landWaterVolumeM.toFixed(2)}m | ` +
    `maxFlux=${m.maxRunoffFlux.toFixed(2)}`
  );
}
