import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// Test the schedule time calculation logic in isolation
describe('Schedule Time Calculation', () => {
  /**
   * Mirrors the calculateScheduleTimes function from emailService.ts.
   * We test the logic directly without database dependencies.
   */
  function calculateScheduleTimes(
    recipients: string[],
    startTime: Date,
    delayMs: number,
    hourlyLimit: number,
  ): Array<{ recipient: string; scheduledAt: Date }> {
    const schedules: Array<{ recipient: string; scheduledAt: Date }> = [];

    let currentTime = startTime.getTime();
    let emailsInCurrentHour = 0;
    let currentHourStart = getHourStart(startTime).getTime();

    for (const recipient of recipients) {
      if (emailsInCurrentHour >= hourlyLimit) {
        currentHourStart += 3600000;
        currentTime = currentHourStart;
        emailsInCurrentHour = 0;
      }

      schedules.push({
        recipient,
        scheduledAt: new Date(currentTime),
      });

      emailsInCurrentHour++;
      currentTime += delayMs;

      if (currentTime >= currentHourStart + 3600000) {
        currentHourStart = getHourStart(new Date(currentTime)).getTime();
        emailsInCurrentHour = 0;
      }
    }

    return schedules;
  }

  function getHourStart(date: Date): Date {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    return d;
  }

  it('should schedule emails with correct delays', () => {
    const start = new Date('2026-09-29T10:00:00Z');
    const recipients = ['a@test.com', 'b@test.com', 'c@test.com'];

    const schedules = calculateScheduleTimes(recipients, start, 2000, 100);

    expect(schedules).toHaveLength(3);
    expect(schedules[0].scheduledAt.getTime()).toBe(start.getTime());
    expect(schedules[1].scheduledAt.getTime()).toBe(start.getTime() + 2000);
    expect(schedules[2].scheduledAt.getTime()).toBe(start.getTime() + 4000);
  });

  it('should respect hourly limit and move to next hour', () => {
    const start = new Date('2026-09-29T10:00:00Z');
    const recipients = ['a@test.com', 'b@test.com', 'c@test.com', 'd@test.com', 'e@test.com'];

    const schedules = calculateScheduleTimes(recipients, start, 2000, 3);

    // First 3 should be in the first hour
    expect(schedules[0].scheduledAt.getTime()).toBe(start.getTime());
    expect(schedules[1].scheduledAt.getTime()).toBe(start.getTime() + 2000);
    expect(schedules[2].scheduledAt.getTime()).toBe(start.getTime() + 4000);

    // Next 2 should start at the next hour
    const nextHour = new Date('2026-09-29T11:00:00Z');
    expect(schedules[3].scheduledAt.getTime()).toBe(nextHour.getTime());
    expect(schedules[4].scheduledAt.getTime()).toBe(nextHour.getTime() + 2000);
  });

  it('should handle 1000+ emails correctly', () => {
    const start = new Date('2026-09-29T10:00:00Z');
    const recipients = Array.from({ length: 1000 }, (_, i) => `user${i}@test.com`);

    const schedules = calculateScheduleTimes(recipients, start, 2000, 100);

    expect(schedules).toHaveLength(1000);

    // Check no duplicates
    const times = new Set(schedules.map((s) => s.scheduledAt.getTime()));
    expect(times.size).toBe(1000);

    // Check ordering is preserved
    for (let i = 1; i < schedules.length; i++) {
      expect(schedules[i].scheduledAt.getTime()).toBeGreaterThanOrEqual(
        schedules[i - 1].scheduledAt.getTime(),
      );
    }
  });

  it('should handle single email', () => {
    const start = new Date('2026-09-29T10:00:00Z');
    const schedules = calculateScheduleTimes(['a@test.com'], start, 2000, 100);

    expect(schedules).toHaveLength(1);
    expect(schedules[0].scheduledAt.getTime()).toBe(start.getTime());
    expect(schedules[0].recipient).toBe('a@test.com');
  });
});

describe('Idempotency Key Generation', () => {
  function generateIdempotencyKey(campaignId: string, recipient: string): string {
    return crypto
      .createHash('sha256')
      .update(`${campaignId}:${recipient}`)
      .digest('hex')
      .slice(0, 32);
  }

  it('should generate deterministic keys', () => {
    const key1 = generateIdempotencyKey('campaign-1', 'user@test.com');
    const key2 = generateIdempotencyKey('campaign-1', 'user@test.com');

    expect(key1).toBe(key2);
  });

  it('should generate unique keys for different campaigns', () => {
    const key1 = generateIdempotencyKey('campaign-1', 'user@test.com');
    const key2 = generateIdempotencyKey('campaign-2', 'user@test.com');

    expect(key1).not.toBe(key2);
  });

  it('should generate unique keys for different recipients', () => {
    const key1 = generateIdempotencyKey('campaign-1', 'a@test.com');
    const key2 = generateIdempotencyKey('campaign-1', 'b@test.com');

    expect(key1).not.toBe(key2);
  });

  it('should produce 32-character hex strings', () => {
    const key = generateIdempotencyKey('campaign-1', 'user@test.com');

    expect(key).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});
