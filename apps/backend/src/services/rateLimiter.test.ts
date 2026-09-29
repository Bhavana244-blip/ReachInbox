import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedisEval = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock('../db/redis', () => ({
  getRedisConnection: () => ({
    eval: mockRedisEval,
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

vi.mock('../config', () => ({
  config: {
    worker: {
      maxEmailsPerHourPerSender: 100,
      minEmailDelayMs: 2000,
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import {
  tryReserveSendSlot,
  checkMinDelay,
  getSenderHourlyCount,
  markRateLimitNotified,
} from '../services/rateLimiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tryReserveSendSlot', () => {
    it('should allow send when under limit', async () => {
      mockRedisEval.mockResolvedValue(5); // Returns current count after increment

      const result = await tryReserveSendSlot('sender-1');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(5);
      expect(mockRedisEval).toHaveBeenCalledOnce();
    });

    it('should deny send when at limit', async () => {
      mockRedisEval.mockResolvedValue(-1); // Returns -1 when limit exceeded

      const result = await tryReserveSendSlot('sender-1');

      expect(result.allowed).toBe(false);
      expect(result.nextWindowStart).toBeDefined();
      expect(result.nextWindowStart!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should use custom limit when provided', async () => {
      mockRedisEval.mockResolvedValue(3);

      const result = await tryReserveSendSlot('sender-1', 50);

      expect(result.allowed).toBe(true);
      // Verify the Lua script was called with custom limit
      expect(mockRedisEval).toHaveBeenCalledWith(
        expect.any(String), // Lua script
        1,
        expect.stringContaining('rate_limit:sender-1:'),
        '50', // Custom limit
        '7200',
      );
    });

    it('should fail open on Redis error', async () => {
      mockRedisEval.mockRejectedValue(new Error('Redis connection error'));

      const result = await tryReserveSendSlot('sender-1');

      expect(result.allowed).toBe(true); // Fail open
    });
  });

  describe('checkMinDelay', () => {
    it('should return 0 when enough time has passed', async () => {
      mockRedisEval.mockResolvedValue(0);

      const waitMs = await checkMinDelay('sender-1');

      expect(waitMs).toBe(0);
    });

    it('should return wait time when too soon', async () => {
      mockRedisEval.mockResolvedValue(1500);

      const waitMs = await checkMinDelay('sender-1');

      expect(waitMs).toBe(1500);
    });

    it('should fail open on Redis error', async () => {
      mockRedisEval.mockRejectedValue(new Error('Redis error'));

      const waitMs = await checkMinDelay('sender-1');

      expect(waitMs).toBe(0); // Fail open
    });
  });

  describe('getSenderHourlyCount', () => {
    it('should return count from Redis', async () => {
      mockRedisGet.mockResolvedValue('42');

      const count = await getSenderHourlyCount('sender-1');

      expect(count).toBe(42);
    });

    it('should return 0 when no key exists', async () => {
      mockRedisGet.mockResolvedValue(null);

      const count = await getSenderHourlyCount('sender-1');

      expect(count).toBe(0);
    });
  });

  describe('markRateLimitNotified', () => {
    it('should return true on first notification', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const shouldNotify = await markRateLimitNotified('sender-1');

      expect(shouldNotify).toBe(true);
    });

    it('should return false on duplicate notification', async () => {
      mockRedisSet.mockResolvedValue(null);

      const shouldNotify = await markRateLimitNotified('sender-1');

      expect(shouldNotify).toBe(false);
    });
  });
});

describe('Rate Limit - Concurrency Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle 10 concurrent workers correctly', async () => {
    // Simulate atomic Redis operation - each call returns incrementing count
    let counter = 0;
    mockRedisEval.mockImplementation(async () => {
      counter++;
      return counter <= 100 ? counter : -1;
    });

    // Simulate 10 workers trying to reserve slots simultaneously
    const promises = Array.from({ length: 10 }, (_, i) =>
      tryReserveSendSlot(`sender-concurrent`),
    );

    const results = await Promise.all(promises);

    // All should be allowed (since atomic counter < 100)
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(mockRedisEval).toHaveBeenCalledTimes(10);
  });

  it('should correctly limit when concurrent requests exceed limit', async () => {
    let counter = 95;
    mockRedisEval.mockImplementation(async () => {
      counter++;
      return counter <= 100 ? counter : -1;
    });

    // Try 10 concurrent requests when only 5 slots left
    const promises = Array.from({ length: 10 }, () =>
      tryReserveSendSlot('sender-limit'),
    );

    const results = await Promise.all(promises);

    const allowed = results.filter((r) => r.allowed).length;
    const denied = results.filter((r) => !r.allowed).length;

    expect(allowed).toBe(5);
    expect(denied).toBe(5);
  });
});
