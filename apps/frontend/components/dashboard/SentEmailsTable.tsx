'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, RefreshCw, ExternalLink } from 'lucide-react';
import { getSentEmails, type EmailRecord, type PaginatedResponse } from '@/lib/api';
import StatusBadge from '@/components/ui/StatusBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Button from '@/components/ui/Button';
import { format } from 'date-fns';

export default function SentEmailsTable() {
  const [data, setData] = useState<PaginatedResponse<EmailRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getSentEmails(page);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sent emails');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return <TableSkeleton rows={5} cols={5} />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="secondary" size="sm" onClick={fetchData} className="mt-3">
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <EmptyState
        icon={<Send className="w-7 h-7 text-text-muted" />}
        title="No sent emails"
        description="Emails will appear here once they have been sent."
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">
          {data.pagination.total} sent email{data.pagination.total !== 1 ? 's' : ''}
        </p>
        <Button variant="ghost" size="sm" onClick={fetchData} loading={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-light bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-light">
            <thead>
              <tr className="bg-surface-toolbar">
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Sender
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Sent Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Preview
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {data.data.map((email) => (
                <tr key={email.id} className="hover:bg-surface-input transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">
                    {email.recipient}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-xs truncate">
                    {email.subject}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {email.sender?.email || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">
                    {email.sentAt
                      ? format(new Date(email.sentAt), 'MMM d, yyyy h:mm a')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="px-4 py-3">
                    {email.etherealPreviewUrl ? (
                      <a
                        href={email.etherealPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        View
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-sm text-text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
