const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export async function getMe() {
  return fetchAPI<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
  }>('/auth/me');
}

export async function logout() {
  return fetchAPI('/auth/logout', { method: 'POST' });
}

export async function devLogin(email?: string, name?: string) {
  return fetchAPI<{ message: string; user: any }>('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
}

export function getGoogleLoginUrl() {
  return `${API_BASE}/auth/google`;
}

// Emails
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmailRecord {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  attempts: number;
  etherealPreviewUrl: string | null;
  errorMessage: string | null;
  sender: { email: string };
  campaign: { subject: string };
  createdAt: string;
}

export async function getScheduledEmails(page: number = 1, limit: number = 25) {
  return fetchAPI<PaginatedResponse<EmailRecord>>(
    `/api/emails/scheduled?page=${page}&limit=${limit}`,
  );
}

export async function getSentEmails(page: number = 1, limit: number = 25) {
  return fetchAPI<PaginatedResponse<EmailRecord>>(
    `/api/emails/sent?page=${page}&limit=${limit}`,
  );
}

export async function searchEmails(query: string, page: number = 1, limit: number = 25) {
  return fetchAPI<PaginatedResponse<EmailRecord>>(
    `/api/emails/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
  );
}

export interface ScheduleEmailsInput {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleResult {
  message: string;
  campaignId: string;
  totalEmails: number;
  estimatedCompletionTime: string;
}

export async function scheduleEmails(data: ScheduleEmailsInput) {
  return fetchAPI<ScheduleResult>('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Senders
export interface Sender {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  hourlyCount?: number;
  createdAt: string;
}

export async function getSenders() {
  return fetchAPI<{ data: Sender[] }>('/api/senders');
}

export async function createSender(data: {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}) {
  return fetchAPI<Sender>('/api/senders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Slack
export async function getSlackStatus() {
  return fetchAPI<{ connected: boolean; teamName?: string }>('/api/slack/status');
}

export async function getSlackConnectUrl(scope?: string) {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return fetchAPI<{ url: string }>(`/api/slack/connect${query}`);
}

export async function connectSlackWebhook(webhookUrl: string, channelName?: string) {
  return fetchAPI<{ message: string; teamName: string }>('/api/slack/webhook', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl, channelName }),
  });
}

export async function testSlackNotification() {
  return fetchAPI<{ message: string }>('/api/slack/test', {
    method: 'POST',
  });
}

export async function disconnectSlack() {
  return fetchAPI('/api/slack/disconnect', { method: 'POST' });
}
