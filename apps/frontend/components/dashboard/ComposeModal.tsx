'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, AlertCircle, Clock, Users, Zap } from 'lucide-react';
import Papa from 'papaparse';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { scheduleEmails, getSenders, type Sender } from '@/lib/api';
import toast from 'react-hot-toast';
import { format, addMilliseconds } from 'date-fns';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParseResult {
  valid: string[];
  invalid: string[];
  duplicates: number;
  totalRows: number;
}

export default function ComposeModal({ isOpen, onClose, onSuccess }: ComposeModalProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTime, setStartTime] = useState('');
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Load senders on mount
  useEffect(() => {
    if (isOpen) {
      getSenders()
        .then((res) => {
          setSenders(res.data);
          if (res.data.length > 0 && !senderId) {
            setSenderId(res.data[0].id);
          }
        })
        .catch(() => toast.error('Failed to load senders'));

      // Default start time to now + 2 minutes
      const now = new Date();
      now.setMinutes(now.getMinutes() + 2);
      now.setSeconds(0, 0);
      setStartTime(format(now, "yyyy-MM-dd'T'HH:mm"));
    }
  }, [isOpen]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      toast.error('Please upload a CSV or TXT file');
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseEmailFile(text);
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
    };
    reader.readAsText(file);

    // Reset the input
    e.target.value = '';
  }, []);

  const parseEmailFile = (text: string) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    let emails: string[] = [];
    let totalRows = 0;

    // Try parsing as CSV first
    try {
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim().toLowerCase(),
      });

      totalRows = result.data.length;

      if (result.data.length > 0) {
        // Look for email column
        const firstRow = result.data[0] as Record<string, string>;
        const emailColumn = Object.keys(firstRow).find(
          (key) =>
            key === 'email' ||
            key === 'e-mail' ||
            key === 'email_address' ||
            key === 'emailaddress',
        );

        if (emailColumn) {
          emails = (result.data as Record<string, string>[])
            .map((row) => row[emailColumn]?.trim())
            .filter(Boolean);
        }
      }
    } catch {
      // Not a valid CSV, fall through
    }

    // If CSV parsing didn't find emails, try regex extraction
    if (emails.length === 0) {
      const matches = text.match(emailRegex);
      emails = matches || [];
      totalRows = text.split('\n').filter((l) => l.trim()).length;
    }

    // Validate and deduplicate
    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    let duplicates = 0;

    for (const email of emails) {
      const lower = email.toLowerCase().trim();
      if (!lower) continue;

      if (seen.has(lower)) {
        duplicates++;
        continue;
      }
      seen.add(lower);

      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(lower)) {
        valid.push(lower);
      } else {
        invalid.push(email);
      }
    }

    setParseResult({ valid, invalid, duplicates, totalRows });

    if (valid.length === 0) {
      toast.error('No valid email addresses found in the file');
    } else {
      toast.success(`Found ${valid.length} valid email address${valid.length !== 1 ? 'es' : ''}`);
    }
  };

  const getEstimatedCompletion = (): string | null => {
    if (!parseResult || parseResult.valid.length === 0 || !startTime) return null;

    const count = parseResult.valid.length;
    const start = new Date(startTime);

    // Calculate based on delay and hourly limit
    const emailsPerHour = Math.min(hourlyLimit, Math.floor(3600000 / delayMs));
    const hoursNeeded = count / emailsPerHour;
    const totalMs = hoursNeeded * 3600000;

    const end = addMilliseconds(start, totalMs);
    return format(end, 'MMM d, yyyy h:mm a');
  };

  const handleSubmit = async () => {
    if (!senderId) {
      toast.error('Please select a sender');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter an email body');
      return;
    }
    if (!parseResult || parseResult.valid.length === 0) {
      toast.error('Please upload a file with valid email addresses');
      return;
    }
    if (!startTime) {
      toast.error('Please select a start time');
      return;
    }

    const start = new Date(startTime);
    if (start < new Date()) {
      toast.error('Start time must be in the future');
      return;
    }

    try {
      setSubmitting(true);
      const result = await scheduleEmails({
        senderId,
        subject: subject.trim(),
        body: body.trim(),
        recipients: parseResult.valid,
        startTime: start.toISOString(),
        delayMs,
        hourlyLimit,
      });

      toast.success(
        `${result.totalEmails} email${result.totalEmails !== 1 ? 's' : ''} scheduled!`,
      );

      // Reset form
      setSubject('');
      setBody('');
      setParseResult(null);
      setFileName(null);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compose New Email" size="lg">
      <div className="space-y-5">
        {/* Sender */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-primary">Sender</label>
          {senders.length === 0 ? (
            <p className="text-sm text-text-muted">
              No senders configured. Add a sender first from the dashboard.
            </p>
          ) : (
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-input border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email} {s.hourlyCount !== undefined ? `(${s.hourlyCount} sent this hour)` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Subject */}
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Enter email subject"
        />

        {/* Body */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-primary">Body (HTML)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Enter email body (HTML supported)"
            rows={5}
            className="w-full px-3 py-2 text-sm bg-surface-editor border border-border-default rounded-lg placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-brand-600 resize-y"
          />
        </div>

        {/* File Upload */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-primary">
            Recipients (CSV/TXT)
          </label>
          <label
            className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border-default rounded-lg cursor-pointer hover:border-brand-500 hover:bg-brand-tint transition-colors"
          >
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="w-6 h-6 text-text-muted" />
              <span className="text-sm text-text-secondary">
                {fileName ? fileName : 'Click to upload CSV or TXT file'}
              </span>
              <span className="text-xs text-text-muted">
                Supports CSV with email column or plain text with email addresses
              </span>
            </div>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Parse Results */}
        {parseResult && (
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-medium text-text-primary">File Analysis</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-white">
                <p className="text-lg font-bold text-brand-600">{parseResult.valid.length}</p>
                <p className="text-xs text-text-muted">Valid Emails</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-white">
                <p className="text-lg font-bold text-text-primary">{parseResult.totalRows}</p>
                <p className="text-xs text-text-muted">Total Rows</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-white">
                <p className="text-lg font-bold text-orange-500">{parseResult.invalid.length}</p>
                <p className="text-xs text-text-muted">Invalid</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-white">
                <p className="text-lg font-bold text-text-secondary">{parseResult.duplicates}</p>
                <p className="text-xs text-text-muted">Duplicates</p>
              </div>
            </div>
            {parseResult.invalid.length > 0 && (
              <div className="flex items-start gap-2 mt-2 text-sm text-orange-600">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {parseResult.invalid.length} invalid email{parseResult.invalid.length !== 1 ? 's' : ''} will be skipped
                </span>
              </div>
            )}
          </div>
        )}

        {/* Scheduling Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Start Time
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-input border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              <Zap className="w-3.5 h-3.5 inline mr-1" />
              Delay Between Emails
            </label>
            <select
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-surface-input border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value={1000}>1 second</option>
              <option value={2000}>2 seconds</option>
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              <Users className="w-3.5 h-3.5 inline mr-1" />
              Hourly Limit
            </label>
            <input
              type="number"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Math.max(1, Number(e.target.value)))}
              min={1}
              max={10000}
              className="w-full px-3 py-2 text-sm bg-surface-input border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>

        {/* Schedule Preview */}
        {parseResult && parseResult.valid.length > 0 && startTime && (
          <div className="rounded-lg border-l-4 border-l-highlight-border border border-border-light bg-highlight-bg p-4 space-y-1 animate-fade-in">
            <p className="text-sm font-medium text-text-primary">
              Schedule Preview
            </p>
            <p className="text-sm text-text-secondary">
              {parseResult.valid.length} email{parseResult.valid.length !== 1 ? 's' : ''} will be
              scheduled starting at{' '}
              <span className="font-medium">
                {format(new Date(startTime), 'MMM d, yyyy h:mm a')}
              </span>
            </p>
            {getEstimatedCompletion() && (
              <p className="text-sm text-text-secondary">
                Estimated completion:{' '}
                <span className="font-medium">{getEstimatedCompletion()}</span>
              </p>
            )}
            <p className="text-xs text-text-muted mt-1">
              Sender limit: {hourlyLimit}/hour • Delay: {delayMs / 1000}s between sends
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border-light">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!parseResult || parseResult.valid.length === 0 || !subject || !body || !senderId}
          >
            Schedule {parseResult ? `${parseResult.valid.length} Emails` : 'Emails'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
