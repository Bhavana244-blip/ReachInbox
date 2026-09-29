'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Link2, Unlink, Send, X, ExternalLink, HelpCircle, CheckCircle2 } from 'lucide-react';
import { getSlackStatus, getSlackConnectUrl, connectSlackWebhook, testSlackNotification, disconnectSlack } from '@/lib/api';
import Button from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function SlackConnection() {
  const [connected, setConnected] = useState(false);
  const [teamName, setTeamName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'oauth' | 'webhook'>('oauth');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await getSlackStatus();
      setConnected(status.connected);
      setTeamName(status.teamName || '');
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthConnect = async () => {
    try {
      const { url } = await getSlackConnectUrl();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate Slack connection');
    }
  };

  const handleWebhookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      toast.error('Please enter a valid Slack webhook URL (https://hooks.slack.com/...)');
      return;
    }

    try {
      setSavingWebhook(true);
      const res = await connectSlackWebhook(webhookUrl.trim(), channelName.trim() || undefined);
      setConnected(true);
      setTeamName(res.teamName || channelName || 'Slack Webhook');
      setModalOpen(false);
      toast.success('Slack webhook connected! A welcome test message was sent.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Slack webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      setTesting(true);
      await testSlackNotification();
      toast.success('Sample rate-limit alert sent to your Slack channel!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test notification');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await disconnectSlack();
      setConnected(false);
      setTeamName('');
      toast.success('Slack disconnected');
    } catch {
      toast.error('Failed to disconnect Slack');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border-default bg-white">
        <div className="w-5 h-5 bg-surface-tertiary animate-pulse rounded" />
        <div className="w-32 h-4 bg-surface-tertiary animate-pulse rounded" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border-default bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              connected ? 'bg-brand-tint' : 'bg-surface-tertiary'
            }`}
          >
            <MessageSquare className={`w-4 h-4 ${connected ? 'text-brand-primary' : 'text-text-muted'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text-primary">
                Slack Notifications
              </p>
              {connected ? (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold text-brand-dark bg-brand-tint rounded-full">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-text-muted bg-surface-tertiary rounded-full">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {connected
                ? `Connected to ${teamName || 'Slack Workspace'} (alerts sent when senders hit limits)`
                : 'Receive real-time alerts when sender rate limits are reached'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
          {connected ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSendTestNotification}
                loading={testing}
                className="whitespace-nowrap text-xs font-medium px-3 py-1.5 h-8 gap-1.5 border-border-default"
              >
                <Send className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                <span>Test Alert</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                loading={disconnecting}
                className="whitespace-nowrap text-xs font-medium px-3 py-1.5 h-8 gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                <Unlink className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Disconnect</span>
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="whitespace-nowrap text-xs font-medium px-3 py-1.5 h-8 gap-1.5 border-brand-primary text-brand-primary hover:bg-brand-tint"
            >
              <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Connect Slack</span>
            </Button>
          )}
        </div>
      </div>

      {/* Connection Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-border-default overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border-default bg-surface-primary">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">Connect Slack</h3>
                  <p className="text-xs text-text-secondary">Get notified when sender hourly limits are hit</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-default px-6 pt-2 bg-surface-primary">
              <button
                type="button"
                onClick={() => setActiveTab('oauth')}
                className={`pb-3 px-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'oauth'
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                One-Click OAuth
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('webhook')}
                className={`pb-3 px-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'webhook'
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Direct Webhook (Instant)
              </button>
            </div>

            {/* Tab 1: OAuth */}
            {activeTab === 'oauth' && (
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                    <HelpCircle className="w-4 h-4 flex-shrink-0" />
                    Before clicking Authorize:
                  </p>
                  <p>In your Slack App console (<strong>api.slack.com/apps</strong>):</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Go to <strong>OAuth &amp; Permissions</strong></li>
                    <li>Add <strong>http://localhost:4000/api/slack/callback</strong> to <strong>Redirect URLs</strong> and click <span className="font-semibold underline">Save URLs</span>.</li>
                    <li>Under <strong>Scopes &gt; Bot Token Scopes</strong>, add <code>chat:write</code> and <code>incoming-webhook</code>.</li>
                  </ol>
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    className="w-full justify-center py-2.5"
                    onClick={handleOAuthConnect}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Authorize with Slack OAuth
                  </Button>
                </div>
              </div>
            )}

            {/* Tab 2: Webhook */}
            {activeTab === 'webhook' && (
              <form onSubmit={handleWebhookSubmit} className="p-6 space-y-4">
                <p className="text-xs text-text-secondary leading-relaxed">
                  You can paste an <strong>Incoming Webhook URL</strong> directly from your Slack workspace or app (e.g. from <em>Incoming Webhooks</em> in Slack app settings).
                </p>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1.5">
                    Slack Webhook URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://hooks.slack.com/services/T00/B00/XXXXX"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border-default bg-surface-secondary focus:bg-white focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1.5">
                    Channel or Team Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="#email-alerts or Outreach Team"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border-default bg-surface-secondary focus:bg-white focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={savingWebhook}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Save &amp; Verify Webhook
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
