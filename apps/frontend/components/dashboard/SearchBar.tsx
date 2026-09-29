'use client';

import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { searchEmails, type EmailRecord } from '@/lib/api';
import StatusBadge from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    try {
      setSearching(true);
      const result = await searchEmails(query.trim());
      setResults(result.data);
      setTotal(result.pagination.total);
      setShowResults(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-8 py-2 text-sm bg-surface-input border border-border-default rounded-lg placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-border-light z-50 max-h-96 overflow-y-auto animate-fade-in">
          <div className="px-4 py-3 border-b border-border-light">
            <p className="text-sm text-text-secondary">
              {total} result{total !== 1 ? 's' : ''} for &quot;{query}&quot;
            </p>
          </div>

          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-text-muted">No emails found</p>
            </div>
          ) : (
            <div className="divide-y divide-border-light">
              {results.map((email) => (
                <div key={email.id} className="px-4 py-3 hover:bg-surface-secondary transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text-primary">{email.recipient}</p>
                    <StatusBadge status={email.status} />
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5 truncate">{email.subject}</p>
                  <p className="text-xs text-text-muted mt-1">
                    {email.sentAt
                      ? `Sent ${format(new Date(email.sentAt), 'MMM d, h:mm a')}`
                      : `Scheduled ${format(new Date(email.scheduledAt), 'MMM d, h:mm a')}`}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-border-light">
            <button
              onClick={clearSearch}
              className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
            >
              Close results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
