'use client';

interface BadgeProps {
  status: string;
}

export default function StatusBadge({ status }: BadgeProps) {
  const normalized = status.toLowerCase();

  const styles: Record<string, string> = {
    scheduled: 'bg-scheduled-bg text-scheduled-text border border-orange-200/80',
    processing: 'bg-highlight-bg text-yellow-800 border border-highlight-border',
    sent: 'bg-surface-badge text-text-badge border border-gray-200',
    failed: 'bg-red-50 text-red-700 border border-red-200',
    rate_limited: 'bg-scheduled-bg text-scheduled-text border border-orange-200/80',
  };

  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    processing: 'Processing',
    sent: 'Sent',
    failed: 'Failed',
    rate_limited: 'Rate Limited',
  };

  return (
    <span
      className={`inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-semibold rounded-full tracking-wide ${
        styles[normalized] || 'bg-surface-badge text-text-badge border border-gray-200'
      }`}
    >
      {labels[normalized] || status}
    </span>
  );
}
