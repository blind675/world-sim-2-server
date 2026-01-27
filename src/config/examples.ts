/**
 * Configuration System Examples
 * 
 * This file demonstrates how to use the configuration system
 * and shows examples of validation errors.
 */

import { getConfig } from './index';

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

export function exampleBasicUsage() {
  const config = getConfig();

  console.log('Planet Configuration:');
  console.log(`  Radius: ${config.planet.radiusKm} km`);
  console.log(`  Seed: ${config.planet.seed}`);

  console.log('\nTime Configuration:');
  console.log(`  Game Step: ${config.time.dtGameStepSeconds}s`);
  console.log(`  Real Interval: ${config.time.realStepIntervalSeconds}s`);
  console.log(`  Acceleration: ${config.derived.acceleration}x`);

  console.log('\nDerived Values:');
  console.log(`  Atmosphere Cells: ${config.derived.atmosphereCellsTotal.toLocaleString()}`);
  console.log(`  Land Chunk Size: ${config.derived.landChunkSizeKm} km`);
}

// ============================================================================
// Example 2: Accessing Nested Config
// ============================================================================

export function exampleNestedAccess() {
  const config = getConfig();

  // Access atmosphere grid config
  const { size, cellSizeKm } = config.grids.atmosphere;
  console.log(`Atmosphere: ${size}x${size} grid, ${cellSizeKm} km cells`);

  // Access land grid config
  const { cellSizeM, chunkCells } = config.grids.land;
  console.log(`Land: ${cellSizeM}m cells, ${chunkCells}x${chunkCells} chunks`);

  // Access runtime config
  const { logLevel, snapshots } = config.runtime;
  console.log(`Runtime: ${logLevel} logging, snapshots ${snapshots.enabled ? 'on' : 'off'}`);
}

// ============================================================================
// Example 3: Using Derived Values
// ============================================================================

export function exampleDerivedValues() {
  const config = getConfig();

  // Calculate how many land chunks fit in the planet
  const planetDiameterKm = config.planet.radiusKm * 2;
  const chunksPerSide = Math.floor(planetDiameterKm / config.derived.landChunkSizeKm);
  const totalChunks = chunksPerSide * chunksPerSide;

  console.log(`Planet can contain approximately ${totalChunks.toLocaleString()} land chunks`);

  // Calculate simulation speed
  const realSecondsPerGameDay = (24 * 60 * 60) / config.derived.acceleration;
  const realMinutesPerGameDay = realSecondsPerGameDay / 60;

  console.log(`One game day = ${realMinutesPerGameDay.toFixed(1)} real minutes`);
}

// ============================================================================
// Example 4: Config is Immutable
// ============================================================================

export function exampleImmutability() {
  const config = getConfig();

  try {
    // This will throw an error because config is frozen
    config.planet.seed = 999;
    console.log('ERROR: Config was modified (should not happen)');
  } catch (error) {
    console.log('✓ Config is properly frozen and immutable');
  }
}

// ============================================================================
// Validation Error Examples (for documentation)
// ============================================================================

/**
 * Example validation errors you might encounter:
 * 
 * 1. Invalid type:
 *    If you set `realStepIntervalSeconds: "2"` (string instead of number)
 *    
 *    Error:
 *    ❌ time.realStepIntervalSeconds:
 *       Expected: number
 *       Received: string
 * 
 * 2. Out of range:
 *    If you set `realStepIntervalSeconds: 100`
 *    
 *    Error:
 *    ❌ time.realStepIntervalSeconds:
 *       Number must be less than or equal to 60
 * 
 * 3. Invalid literal:
 *    If you set `dtGameStepSeconds: 120`
 *    
 *    Error:
 *    ❌ time.dtGameStepSeconds:
 *       Expected literal: 60
 *       Received: 120
 * 
 * 4. Unknown key (typo):
 *    If you add `planett: { ... }` instead of `planet`
 *    
 *    Error:
 *    ❌ :
 *       Unrecognized keys: planett
 *       (This may be a typo or unsupported field)
 * 
 * 5. Missing required field:
 *    If you omit `planet.seed`
 *    
 *    Error:
 *    ❌ planet.seed:
 *       Required
 */
