'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Calendar, Send, UserPlus } from 'lucide-react';
import { getMe } from '@/lib/api';
import Header from '@/components/dashboard/Header';
import ScheduledEmailsTable from '@/components/dashboard/ScheduledEmailsTable';
import SentEmailsTable from '@/components/dashboard/SentEmailsTable';
import ComposeModal from '@/components/dashboard/ComposeModal';
import AddSenderModal from '@/components/dashboard/AddSenderModal';
import SlackConnection from '@/components/dashboard/SlackConnection';
import SearchBar from '@/components/dashboard/SearchBar';
import Button from '@/components/ui/Button';
import toast from 'react-hot-toast';

type Tab = 'scheduled' | 'sent';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [showCompose, setShowCompose] = useState(false);
  const [showAddSender, setShowAddSender] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('reachinbox_token', token);
      // Clean token param from URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }

    getMe()
      .then(setUser)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  // Handle Slack callback params
  useEffect(() => {
    const slack = searchParams.get('slack');
    if (slack === 'connected') {
      toast.success('Slack connected successfully!');
    } else if (slack === 'error') {
      toast.error('Failed to connect Slack');
    }
  }, [searchParams]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-sm text-text-muted">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Header user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Email Dashboard</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Schedule, manage, and monitor your email campaigns
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setShowAddSender(true)}>
              <UserPlus className="w-4 h-4" />
              Add Sender
            </Button>
            <Button onClick={() => setShowCompose(true)}>
              <Plus className="w-4 h-4" />
              Compose New Email
            </Button>
          </div>
        </div>

        {/* Slack + Search row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SlackConnection />
          <SearchBar />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-border-light shadow-sm">
          <div className="flex border-b border-border-light">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'scheduled'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Scheduled Emails
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'sent'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Send className="w-4 h-4" />
              Sent Emails
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'scheduled' ? (
              <ScheduledEmailsTable key={`scheduled-${refreshKey}`} />
            ) : (
              <SentEmailsTable key={`sent-${refreshKey}`} />
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        onSuccess={handleRefresh}
      />
      <AddSenderModal
        isOpen={showAddSender}
        onClose={() => setShowAddSender(false)}
        onSuccess={handleRefresh}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-brand-200 border-t-brand-600 animate-spin" />
            <p className="text-sm text-text-muted">Loading dashboard...</p>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
