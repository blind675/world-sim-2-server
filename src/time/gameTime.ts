/**
 * GameTime — Immutable value object representing simulation time.
 *
 * Calendar: 60 min/hour, 24 hours/day, 30 days/month, 12 months/year (360 days/year)
 * All fields are zero-indexed.
 * Internal representation is a single integer: totalMinutes.
 */

// ── Calendar Constants ──────────────────────────────────────────────

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;           // 1440
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * DAYS_PER_MONTH;         // 43200
export const MINUTES_PER_YEAR = MINUTES_PER_MONTH * MONTHS_PER_YEAR;       // 518400
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;             // 360
export const SECONDS_PER_MINUTE = 60;

// ── Type ────────────────────────────────────────────────────────────

export interface GameTime {
  /** Total elapsed minutes since simulation start (canonical representation) */
  readonly totalMinutes: number;

  /** Derived: current minute within the hour (0–59) */
  readonly minute: number;
  /** Derived: current hour within the day (0–23) */
  readonly hour: number;
  /** Derived: current day within the month (0–29) */
  readonly day: number;
  /** Derived: current month within the year (0–11) */
  readonly month: number;
  /** Derived: current year (0+) */
  readonly year: number;

  /** Derived: day-of-year (0–359) */
  readonly dayOfYear: number;
  /** Derived: total elapsed days since simulation start */
  readonly totalDays: number;
}

// ── Factory Functions ───────────────────────────────────────────────

/**
 * Create a GameTime from a total-minutes value.
 */
export function createGameTime(totalMinutes: number): GameTime {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) {
    throw new Error(`totalMinutes must be a non-negative integer, got ${totalMinutes}`);
  }

  let remaining = totalMinutes;

  const year = Math.floor(remaining / MINUTES_PER_YEAR);
  remaining -= year * MINUTES_PER_YEAR;

  const month = Math.floor(remaining / MINUTES_PER_MONTH);
  remaining -= month * MINUTES_PER_MONTH;

  const day = Math.floor(remaining / MINUTES_PER_DAY);
  remaining -= day * MINUTES_PER_DAY;

  const hour = Math.floor(remaining / MINUTES_PER_HOUR);
  const minute = remaining - hour * MINUTES_PER_HOUR;

  const dayOfYear = month * DAYS_PER_MONTH + day;
  const totalDays = Math.floor(totalMinutes / MINUTES_PER_DAY);

  const gameTime: GameTime = {
    totalMinutes,
    minute,
    hour,
    day,
    month,
    year,
    dayOfYear,
    totalDays,
  };

  return Object.freeze(gameTime);
}

/**
 * Create a GameTime from explicit calendar components (all zero-indexed).
 */
export function createGameTimeFromComponents(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): GameTime {
  if (!Number.isInteger(year) || year < 0) {
    throw new Error(`year must be a non-negative integer, got ${year}`);
  }
  if (!Number.isInteger(month) || month < 0 || month >= MONTHS_PER_YEAR) {
    throw new Error(`month must be 0–${MONTHS_PER_YEAR - 1}, got ${month}`);
  }
  if (!Number.isInteger(day) || day < 0 || day >= DAYS_PER_MONTH) {
    throw new Error(`day must be 0–${DAYS_PER_MONTH - 1}, got ${day}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS_PER_DAY) {
    throw new Error(`hour must be 0–${HOURS_PER_DAY - 1}, got ${hour}`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute >= MINUTES_PER_HOUR) {
    throw new Error(`minute must be 0–${MINUTES_PER_HOUR - 1}, got ${minute}`);
  }

  const totalMinutes =
    year * MINUTES_PER_YEAR +
    month * MINUTES_PER_MONTH +
    day * MINUTES_PER_DAY +
    hour * MINUTES_PER_HOUR +
    minute;

  return createGameTime(totalMinutes);
}

// ── Operations ──────────────────────────────────────────────────────

/**
 * Advance a GameTime by a number of game-seconds.
 * Returns a new GameTime (immutable).
 *
 * Since the engine step is 60 game-seconds = 1 minute,
 * this converts seconds to whole minutes and advances.
 */
export function advanceTime(time: GameTime, deltaSeconds: number): GameTime {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(`deltaSeconds must be a non-negative integer, got ${deltaSeconds}`);
  }

  if (deltaSeconds % SECONDS_PER_MINUTE !== 0) {
    throw new Error(
      `deltaSeconds must be a multiple of ${SECONDS_PER_MINUTE}, got ${deltaSeconds}`
    );
  }

  const deltaMinutes = deltaSeconds / SECONDS_PER_MINUTE;
  return createGameTime(time.totalMinutes + deltaMinutes);
}

/**
 * Advance a GameTime by a number of minutes.
 * Returns a new GameTime (immutable).
 */
export function advanceTimeByMinutes(time: GameTime, deltaMinutes: number): GameTime {
  if (!Number.isInteger(deltaMinutes) || deltaMinutes < 0) {
    throw new Error(`deltaMinutes must be a non-negative integer, got ${deltaMinutes}`);
  }

  return createGameTime(time.totalMinutes + deltaMinutes);
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Fractional hour of the day (0.0–23.999...).
 * Useful for smooth diurnal curves (temperature, lighting).
 */
export function fractionalHour(time: GameTime): number {
  return time.hour + time.minute / MINUTES_PER_HOUR;
}

/**
 * Fractional progress through the current year (0.0–1.0).
 * Useful for seasonal calculations.
 */
export function yearProgress(time: GameTime): number {
  const minutesIntoYear =
    time.month * MINUTES_PER_MONTH +
    time.day * MINUTES_PER_DAY +
    time.hour * MINUTES_PER_HOUR +
    time.minute;

  return minutesIntoYear / MINUTES_PER_YEAR;
}

/**
 * Fractional progress through the current day (0.0–1.0).
 * Useful for diurnal calculations.
 */
export function dayProgress(time: GameTime): number {
  return (time.hour * MINUTES_PER_HOUR + time.minute) / MINUTES_PER_DAY;
}

// ── Serialization ───────────────────────────────────────────────────

export interface GameTimeState {
  totalMinutes: number;
}

export function serializeGameTime(time: GameTime): GameTimeState {
  return { totalMinutes: time.totalMinutes };
}

export function deserializeGameTime(state: GameTimeState): GameTime {
  return createGameTime(state.totalMinutes);
}

// ── Display ─────────────────────────────────────────────────────────

/**
 * Human-readable string for display/logging.
 * Format: "Y0 M0 D0 HH:MM"
 */
export function formatGameTime(time: GameTime): string {
  const hh = String(time.hour).padStart(2, '0');
  const mm = String(time.minute).padStart(2, '0');
  return `Y${time.year} M${time.month} D${time.day} ${hh}:${mm}`;
}
