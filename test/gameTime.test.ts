import {
  createGameTime,
  createGameTimeFromComponents,
  advanceTime,
  advanceTimeByMinutes,
  fractionalHour,
  yearProgress,
  dayProgress,
  serializeGameTime,
  deserializeGameTime,
  formatGameTime,
  MINUTES_PER_HOUR,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  MINUTES_PER_YEAR,
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  HOURS_PER_DAY,
  DAYS_PER_YEAR,
  SECONDS_PER_MINUTE,
} from '../src/time';

describe('Calendar Constants', () => {
  it('should have correct derived constants', () => {
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(MINUTES_PER_MONTH).toBe(43200);
    expect(MINUTES_PER_YEAR).toBe(518400);
    expect(DAYS_PER_YEAR).toBe(360);
  });
});

describe('createGameTime', () => {
  it('should create time at zero', () => {
    const t = createGameTime(0);
    expect(t.totalMinutes).toBe(0);
    expect(t.year).toBe(0);
    expect(t.month).toBe(0);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(0);
    expect(t.dayOfYear).toBe(0);
    expect(t.totalDays).toBe(0);
  });

  it('should decompose 90 minutes correctly', () => {
    const t = createGameTime(90);
    expect(t.year).toBe(0);
    expect(t.month).toBe(0);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(1);
    expect(t.minute).toBe(30);
  });

  it('should decompose 1 full day', () => {
    const t = createGameTime(MINUTES_PER_DAY);
    expect(t.day).toBe(1);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(0);
  });

  it('should decompose 1 full month', () => {
    const t = createGameTime(MINUTES_PER_MONTH);
    expect(t.month).toBe(1);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(0);
  });

  it('should decompose 1 full year', () => {
    const t = createGameTime(MINUTES_PER_YEAR);
    expect(t.year).toBe(1);
    expect(t.month).toBe(0);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(0);
  });

  it('should decompose a complex time correctly', () => {
    // Year 2, Month 5, Day 15, Hour 13, Minute 45
    const totalMinutes =
      2 * MINUTES_PER_YEAR +
      5 * MINUTES_PER_MONTH +
      15 * MINUTES_PER_DAY +
      13 * MINUTES_PER_HOUR +
      45;

    const t = createGameTime(totalMinutes);
    expect(t.year).toBe(2);
    expect(t.month).toBe(5);
    expect(t.day).toBe(15);
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(45);
    expect(t.dayOfYear).toBe(5 * DAYS_PER_MONTH + 15); // 165
    expect(t.totalDays).toBe(2 * DAYS_PER_YEAR + 165);
  });

  it('should be frozen (immutable)', () => {
    const t = createGameTime(0);
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('should throw on negative totalMinutes', () => {
    expect(() => createGameTime(-1)).toThrow();
  });

  it('should throw on non-integer totalMinutes', () => {
    expect(() => createGameTime(1.5)).toThrow();
  });

  it('should compute dayOfYear at month boundaries', () => {
    // Start of month 11 (last month), day 0
    const t = createGameTime(11 * MINUTES_PER_MONTH);
    expect(t.dayOfYear).toBe(330);
  });

  it('should compute dayOfYear at end of year', () => {
    // Last minute of the year: month 11, day 29, hour 23, minute 59
    const t = createGameTime(MINUTES_PER_YEAR - 1);
    expect(t.year).toBe(0);
    expect(t.month).toBe(11);
    expect(t.day).toBe(29);
    expect(t.hour).toBe(23);
    expect(t.minute).toBe(59);
    expect(t.dayOfYear).toBe(359);
  });
});

describe('createGameTimeFromComponents', () => {
  it('should create time from components', () => {
    const t = createGameTimeFromComponents(1, 6, 15, 12, 30);
    expect(t.year).toBe(1);
    expect(t.month).toBe(6);
    expect(t.day).toBe(15);
    expect(t.hour).toBe(12);
    expect(t.minute).toBe(30);
  });

  it('should roundtrip with createGameTime', () => {
    const totalMinutes =
      3 * MINUTES_PER_YEAR +
      7 * MINUTES_PER_MONTH +
      22 * MINUTES_PER_DAY +
      18 * MINUTES_PER_HOUR +
      55;

    const t1 = createGameTime(totalMinutes);
    const t2 = createGameTimeFromComponents(t1.year, t1.month, t1.day, t1.hour, t1.minute);
    expect(t2.totalMinutes).toBe(totalMinutes);
  });

  it('should throw on invalid month', () => {
    expect(() => createGameTimeFromComponents(0, 12, 0, 0, 0)).toThrow();
    expect(() => createGameTimeFromComponents(0, -1, 0, 0, 0)).toThrow();
  });

  it('should throw on invalid day', () => {
    expect(() => createGameTimeFromComponents(0, 0, 30, 0, 0)).toThrow();
    expect(() => createGameTimeFromComponents(0, 0, -1, 0, 0)).toThrow();
  });

  it('should throw on invalid hour', () => {
    expect(() => createGameTimeFromComponents(0, 0, 0, 24, 0)).toThrow();
    expect(() => createGameTimeFromComponents(0, 0, 0, -1, 0)).toThrow();
  });

  it('should throw on invalid minute', () => {
    expect(() => createGameTimeFromComponents(0, 0, 0, 0, 60)).toThrow();
    expect(() => createGameTimeFromComponents(0, 0, 0, 0, -1)).toThrow();
  });

  it('should throw on negative year', () => {
    expect(() => createGameTimeFromComponents(-1, 0, 0, 0, 0)).toThrow();
  });

  it('should accept boundary values', () => {
    const t = createGameTimeFromComponents(0, 11, 29, 23, 59);
    expect(t.year).toBe(0);
    expect(t.month).toBe(11);
    expect(t.day).toBe(29);
    expect(t.hour).toBe(23);
    expect(t.minute).toBe(59);
  });
});

describe('advanceTime', () => {
  it('should advance by one engine step (60 seconds = 1 minute)', () => {
    const t0 = createGameTime(0);
    const t1 = advanceTime(t0, 60);
    expect(t1.totalMinutes).toBe(1);
    expect(t1.minute).toBe(1);
  });

  it('should advance by multiple steps', () => {
    const t0 = createGameTime(0);
    const t1 = advanceTime(t0, 3600); // 60 minutes
    expect(t1.totalMinutes).toBe(60);
    expect(t1.hour).toBe(1);
    expect(t1.minute).toBe(0);
  });

  it('should roll over day boundary', () => {
    const t0 = createGameTimeFromComponents(0, 0, 0, 23, 59);
    const t1 = advanceTime(t0, 60);
    expect(t1.day).toBe(1);
    expect(t1.hour).toBe(0);
    expect(t1.minute).toBe(0);
  });

  it('should roll over month boundary', () => {
    const t0 = createGameTimeFromComponents(0, 0, 29, 23, 59);
    const t1 = advanceTime(t0, 60);
    expect(t1.month).toBe(1);
    expect(t1.day).toBe(0);
    expect(t1.hour).toBe(0);
    expect(t1.minute).toBe(0);
  });

  it('should roll over year boundary', () => {
    const t0 = createGameTimeFromComponents(0, 11, 29, 23, 59);
    const t1 = advanceTime(t0, 60);
    expect(t1.year).toBe(1);
    expect(t1.month).toBe(0);
    expect(t1.day).toBe(0);
    expect(t1.hour).toBe(0);
    expect(t1.minute).toBe(0);
  });

  it('should not mutate original', () => {
    const t0 = createGameTime(0);
    advanceTime(t0, 60);
    expect(t0.totalMinutes).toBe(0);
  });

  it('should throw on non-multiple of 60', () => {
    const t0 = createGameTime(0);
    expect(() => advanceTime(t0, 30)).toThrow();
    expect(() => advanceTime(t0, 61)).toThrow();
  });

  it('should throw on negative deltaSeconds', () => {
    const t0 = createGameTime(0);
    expect(() => advanceTime(t0, -60)).toThrow();
  });

  it('should accept zero deltaSeconds', () => {
    const t0 = createGameTime(100);
    const t1 = advanceTime(t0, 0);
    expect(t1.totalMinutes).toBe(100);
  });
});

describe('advanceTimeByMinutes', () => {
  it('should advance by minutes directly', () => {
    const t0 = createGameTime(0);
    const t1 = advanceTimeByMinutes(t0, 90);
    expect(t1.totalMinutes).toBe(90);
    expect(t1.hour).toBe(1);
    expect(t1.minute).toBe(30);
  });

  it('should throw on negative minutes', () => {
    const t0 = createGameTime(0);
    expect(() => advanceTimeByMinutes(t0, -1)).toThrow();
  });

  it('should throw on non-integer minutes', () => {
    const t0 = createGameTime(0);
    expect(() => advanceTimeByMinutes(t0, 1.5)).toThrow();
  });
});

describe('Query Functions', () => {
  describe('fractionalHour', () => {
    it('should return 0 at midnight', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 0, 0);
      expect(fractionalHour(t)).toBe(0);
    });

    it('should return 12.5 at 12:30', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 12, 30);
      expect(fractionalHour(t)).toBe(12.5);
    });

    it('should return 23.983... at 23:59', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 23, 59);
      expect(fractionalHour(t)).toBeCloseTo(23.9833, 3);
    });
  });

  describe('yearProgress', () => {
    it('should return 0 at start of year', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 0, 0);
      expect(yearProgress(t)).toBe(0);
    });

    it('should return ~0.5 at mid-year', () => {
      const t = createGameTimeFromComponents(0, 6, 0, 0, 0);
      expect(yearProgress(t)).toBeCloseTo(0.5, 5);
    });

    it('should approach 1.0 at end of year', () => {
      const t = createGameTimeFromComponents(0, 11, 29, 23, 59);
      expect(yearProgress(t)).toBeCloseTo(1.0, 3);
    });

    it('should be independent of year number', () => {
      const t1 = createGameTimeFromComponents(0, 3, 15, 12, 0);
      const t2 = createGameTimeFromComponents(5, 3, 15, 12, 0);
      expect(yearProgress(t1)).toBe(yearProgress(t2));
    });
  });

  describe('dayProgress', () => {
    it('should return 0 at midnight', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 0, 0);
      expect(dayProgress(t)).toBe(0);
    });

    it('should return 0.5 at noon', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 12, 0);
      expect(dayProgress(t)).toBe(0.5);
    });

    it('should approach 1.0 at end of day', () => {
      const t = createGameTimeFromComponents(0, 0, 0, 23, 59);
      expect(dayProgress(t)).toBeCloseTo(1.0, 2);
    });
  });
});

describe('Serialization', () => {
  it('should serialize to totalMinutes', () => {
    const t = createGameTime(12345);
    const state = serializeGameTime(t);
    expect(state).toEqual({ totalMinutes: 12345 });
  });

  it('should deserialize from state', () => {
    const state = { totalMinutes: 12345 };
    const t = deserializeGameTime(state);
    expect(t.totalMinutes).toBe(12345);
  });

  it('should roundtrip correctly', () => {
    const original = createGameTimeFromComponents(3, 7, 22, 18, 55);
    const state = serializeGameTime(original);
    const restored = deserializeGameTime(state);

    expect(restored.totalMinutes).toBe(original.totalMinutes);
    expect(restored.year).toBe(original.year);
    expect(restored.month).toBe(original.month);
    expect(restored.day).toBe(original.day);
    expect(restored.hour).toBe(original.hour);
    expect(restored.minute).toBe(original.minute);
  });
});

describe('formatGameTime', () => {
  it('should format zero time', () => {
    const t = createGameTime(0);
    expect(formatGameTime(t)).toBe('Y0 M0 D0 00:00');
  });

  it('should format with padding', () => {
    const t = createGameTimeFromComponents(1, 3, 5, 9, 7);
    expect(formatGameTime(t)).toBe('Y1 M3 D5 09:07');
  });

  it('should format large values', () => {
    const t = createGameTimeFromComponents(100, 11, 29, 23, 59);
    expect(formatGameTime(t)).toBe('Y100 M11 D29 23:59');
  });
});

describe('Determinism', () => {
  it('should produce identical results for identical inputs', () => {
    const t1 = createGameTime(123456);
    const t2 = createGameTime(123456);

    expect(t1.totalMinutes).toBe(t2.totalMinutes);
    expect(t1.year).toBe(t2.year);
    expect(t1.month).toBe(t2.month);
    expect(t1.day).toBe(t2.day);
    expect(t1.hour).toBe(t2.hour);
    expect(t1.minute).toBe(t2.minute);
  });

  it('should produce consistent results after many advances', () => {
    let t = createGameTime(0);
    const steps = MINUTES_PER_YEAR; // 1 full year of 1-minute steps

    for (let i = 0; i < steps; i++) {
      t = advanceTimeByMinutes(t, 1);
    }

    expect(t.year).toBe(1);
    expect(t.month).toBe(0);
    expect(t.day).toBe(0);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(0);
    expect(t.totalMinutes).toBe(MINUTES_PER_YEAR);
  });
});
