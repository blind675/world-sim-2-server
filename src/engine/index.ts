export {
  // Types
  type StepContext,
  type StepHandler,
  type SystemHandler,
  type EngineLoopConfig,
  type EngineLoopState,
  type AccumulatorState,
  type EngineLoop,

  // Factory (low-level — prefer singleton API below)
  createEngineLoop,
  restoreEngineLoop,
} from './engineLoop';

export {
  // Singleton API (enforces restart-only config)
  startEngine,
  restoreAndStartEngine,
  stopEngine,
  getActiveEngine,
  isEngineRunning,
  _resetEngineSingleton,
} from './singleton';
