import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirror the validation schemas from routes/emails.ts
const scheduleEmailSchema = z.object({
  senderId: z.string().min(1, 'Sender is required'),
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
  recipients: z
    .array(z.string().email('Invalid email address'))
    .min(1, 'At least one recipient is required')
    .max(10000, 'Too many recipients'),
  startTime: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid start time'),
  delayMs: z.number().int().min(500).max(60000).default(2000),
  hourlyLimit: z.number().int().min(1).max(10000).default(100),
});

describe('Schedule Email Validation', () => {
  it('should accept valid input', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test Subject',
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
      delayMs: 2000,
      hourlyLimit: 100,
    });

    expect(result.success).toBe(true);
  });

  it('should reject empty subject', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: '',
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain('subject');
    }
  });

  it('should reject invalid email addresses', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test',
      body: '<p>Hello</p>',
      recipients: ['not-an-email', 'also-bad'],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty recipients', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test',
      body: '<p>Hello</p>',
      recipients: [],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid start time', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test',
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: 'not-a-date',
    });

    expect(result.success).toBe(false);
  });

  it('should use default delayMs when not provided', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test',
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delayMs).toBe(2000);
      expect(result.data.hourlyLimit).toBe(100);
    }
  });

  it('should reject delayMs below minimum', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'Test',
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
      delayMs: 100, // below 500 minimum
    });

    expect(result.success).toBe(false);
  });

  it('should accept subject at max length', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'A'.repeat(500),
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(true);
  });

  it('should reject subject over max length', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: 'sender-123',
      subject: 'A'.repeat(501),
      body: '<p>Hello</p>',
      recipients: ['user@example.com'],
      startTime: '2026-12-01T10:00:00Z',
    });

    expect(result.success).toBe(false);
  });
});
