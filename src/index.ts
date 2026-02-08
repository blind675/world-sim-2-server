import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthCheckRouter from './routes/healthCheck';
import timeRouter from './routes/time';
import worldInfoRouter from './routes/worldInfo';
import landMetricsRouter from './routes/landMetrics';
import { getConfig } from './config';
import { validateApiKey } from './middleware/auth';
import { startEngine } from './engine';
import { initWorld, logLandMetrics } from './world';

dotenv.config();

const config = getConfig();

console.log('=== FlatWorld Configuration ===');
console.log(`Planet: ${config.planet.radiusKm} km radius, seed ${config.planet.seed}`);
console.log(`Time: ${config.time.dtGameStepSeconds}s game step, ${config.time.realStepIntervalSeconds}s real interval`);
console.log(`Acceleration: ${config.derived.acceleration.toFixed(1)}x`);
console.log(`Atmosphere Grid: ${config.grids.atmosphere.size}x${config.grids.atmosphere.size} (${config.derived.atmosphereCellsTotal.toLocaleString()} cells)`);
console.log(`Land Grid: ${config.grids.land.cellSizeM}m cells, ${config.grids.land.chunkCells}x${config.grids.land.chunkCells} chunks`);
console.log(`Land Chunk: ${config.derived.landChunkSizeKm.toFixed(2)} km (${config.derived.landChunkSizeCells.toLocaleString()} cells)`);
console.log(`Log Level: ${config.runtime.logLevel}`);
console.log(`Snapshots: ${config.runtime.snapshots.enabled ? 'enabled' : 'disabled'}`);
console.log('===============================\n');

const app: Application = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/health-check', healthCheckRouter);

app.use(validateApiKey);

// All routes after this point require API key authentication
app.use('/api/time', timeRouter);
app.use('/api/world-info', worldInfoRouter);
app.use('/api/land-metrics', landMetricsRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/api/health-check`);

  // Initialize world (terrain generation + chunk manager)
  const planetSizeM = config.planet.radiusKm * 2 * 1000;
  initWorld({
    seed: config.planet.seed,
    worldWidthM: planetSizeM,
    worldHeightM: planetSizeM,
    worldCellsX: config.derived.worldCellsX,
    worldCellsY: config.derived.worldCellsY,
    landCellSizeM: config.grids.land.cellSizeM,
    chunkCells: config.grids.land.chunkCells,
  });

  // Start engine (singleton — restart-only config enforcement)
  const engine = startEngine({
    dtGameStepSeconds: config.time.dtGameStepSeconds,
    realStepIntervalSeconds: config.time.realStepIntervalSeconds,
  });

  // Log land metrics every 10 in-game minutes (600 game-seconds)
  engine.registerSystem('land-metrics', 600, logLandMetrics);
});
