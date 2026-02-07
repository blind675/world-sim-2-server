import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthCheckRouter from './routes/healthCheck';
import { getConfig } from './config';

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

app.use('/api', healthCheckRouter);


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/api/health-check`);
});
