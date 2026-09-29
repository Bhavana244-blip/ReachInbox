import { config } from '../config';
import { getRedisConnection } from '../db/redis';
import { logger } from '../utils/logger';

/**
 * Redis-backed rate limiter for email sending.
 * 
 * Uses atomic Redis operations (Lua scripts) to ensure safety across
 * multiple workers and application instances.
 * 
 * Two coordination mechanisms:
 * 1. Hourly rate limit per sender - tracks sends per sender per hour window
 * 2. Minimum delay between sends per sender - prevents burst sending
 */

/**
 * Get the current hour window key for rate limiting.
 * Format: YYYY-MM-DDTHH (UTC)
 */
function getHourWindow(date: Date = new Date()): string {
  return date.toISOString().slice(0, 13); // e.g., "2026-09-29T18"
}

/**
 * Get the next hour window start time.
 */
export function getNextHourWindowStart(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

// Lua script for atomic rate limit check and increment.
// Returns: 1 if allowed, 0 if rate limited
// Also sets expiry on the counter key so it auto-cleans.
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or '0')
if current >= limit then
  return 0
end

redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
return 1
`;

// Lua script for atomic rate limit reservation.
// Returns the current count AFTER increment, or -1 if would exceed limit.
const RATE_LIMIT_RESERVE_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or '0')
if current >= limit then
  return -1
end

local newCount = redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
return newCount
`;

// Lua script for minimum delay enforcement.
// Uses a Redis key to track the last send timestamp per sender.
// Returns: 0 if can proceed, or milliseconds to wait.
const MIN_DELAY_LUA = `
local key = KEYS[1]
local minDelayMs = tonumber(ARGV[1])
local nowMs = tonumber(ARGV[2])

local lastSendMs = tonumber(redis.call('GET', key) or '0')
local elapsed = nowMs - lastSendMs

if elapsed < minDelayMs then
  return minDelayMs - elapsed
end

redis.call('SET', key, tostring(nowMs))
redis.call('PEXPIRE', key, minDelayMs * 2)
return 0
`;

export interface RateLimitResult {
  allowed: boolean;
  currentCount?: number;
  waitMs?: number;
  nextWindowStart?: Date;
}

/**
 * Attempt to reserve a send slot for a sender in the current hour window.
 * Uses atomic Redis Lua script to prevent race conditions.
 * 
 * @returns Result indicating if the send is allowed or must be delayed
 */
export async function tryReserveSendSlot(
  senderId: string,
  limit?: number,
): Promise<RateLimitResult> {
  const redis = getRedisConnection();
  const hourWindow = getHourWindow();
  const rateLimitKey = `rate_limit:${senderId}:${hourWindow}`;
  const maxPerHour = limit || config.worker.maxEmailsPerHourPerSender;

  try {
    const result = await redis.eval(
      RATE_LIMIT_RESERVE_LUA,
      1,
      rateLimitKey,
      maxPerHour.toString(),
      '7200', // TTL: 2 hours (covers the current window + buffer)
    ) as number;

    if (result === -1) {
      const nextWindow = getNextHourWindowStart();
      logger.warn(
        { senderId, hourWindow, maxPerHour, nextWindow },
        'Sender hourly rate limit reached',
      );

      return {
        allowed: false,
        nextWindowStart: nextWindow,
      };
    }

    return {
      allowed: true,
      currentCount: result,
    };
  } catch (err) {
    logger.error({ err, senderId }, 'Rate limit check failed');
    // Fail open: allow the send rather than blocking on Redis errors
    return { allowed: true };
  }
}

/**
 * Check the minimum delay between sends for a sender.
 * Uses atomic Redis Lua script for cross-worker coordination.
 * 
 * @returns 0 if can proceed, or milliseconds to wait
 */
export async function checkMinDelay(
  senderId: string,
  minDelayMs?: number,
): Promise<number> {
  const redis = getRedisConnection();
  const delayKey = `send_delay:${senderId}`;
  const delay = minDelayMs || config.worker.minEmailDelayMs;

  try {
    const waitMs = await redis.eval(
      MIN_DELAY_LUA,
      1,
      delayKey,
      delay.toString(),
      Date.now().toString(),
    ) as number;

    if (waitMs > 0) {
      logger.debug({ senderId, waitMs }, 'Minimum delay not met, must wait');
    }

    return waitMs;
  } catch (err) {
    logger.error({ err, senderId }, 'Min delay check failed');
    return 0; // Fail open
  }
}

/**
 * Get the current send count for a sender in the current hour window.
 */
export async function getSenderHourlyCount(senderId: string): Promise<number> {
  const redis = getRedisConnection();
  const hourWindow = getHourWindow();
  const key = `rate_limit:${senderId}:${hourWindow}`;

  try {
    const count = await redis.get(key);
    return parseInt(count || '0', 10);
  } catch (err) {
    logger.error({ err, senderId }, 'Failed to get sender hourly count');
    return 0;
  }
}

/**
 * Track that we've already sent a rate-limit notification for this sender+window.
 * Returns true if this is the first notification for this window (should send).
 * Returns false if already notified (should skip to prevent spam).
 */
export async function markRateLimitNotified(senderId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const hourWindow = getHourWindow();
  const key = `rate_limit_notified:${senderId}:${hourWindow}`;

  try {
    // SET NX returns OK if the key was set, null if it already existed
    const result = await redis.set(key, '1', 'EX', 7200, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.error({ err, senderId }, 'Failed to check rate limit notification status');
    return false;
  }
}
