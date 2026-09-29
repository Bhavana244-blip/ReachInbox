'use client';

import { useState } from 'react';
import { Mail, ArrowRight, Shield, Zap, Clock } from 'lucide-react';
import { getGoogleLoginUrl, devLogin } from '@/lib/api';

export default function LoginPage() {
  const [demoLoading, setDemoLoading] = useState(false);
  return (
    <div className="min-h-screen flex">
      {/* Left panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-40 h-40 border border-white/20 rounded-full" />
          <div className="absolute bottom-32 right-20 w-64 h-64 border border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 border border-white/20 rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">ReachInbox</span>
          </div>
          <p className="text-blue-200 text-sm mt-1">Email Scheduler Dashboard</p>
        </div>

        <div className="relative z-10 space-y-8">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Schedule and manage your email campaigns with confidence.
          </h2>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-blue-200" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Persistent Scheduling</p>
                <p className="text-blue-200 text-sm">Jobs survive server restarts with zero data loss</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-blue-200" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Smart Rate Limiting</p>
                <p className="text-blue-200 text-sm">Per-sender hourly limits with automatic rescheduling</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-blue-200" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Idempotent Processing</p>
                <p className="text-blue-200 text-sm">No duplicate sends even under concurrent workers</p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-blue-300 text-xs">
          &copy; {new Date().getFullYear()} ReachInbox. Built with BullMQ, Redis, and Elasticsearch.
        </p>
      </div>

      {/* Right panel - Login */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-text-primary">ReachInbox</span>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
            <p className="text-text-secondary mt-2">
              Sign in to access your email scheduler dashboard
            </p>
          </div>

          <a
            href={getGoogleLoginUrl()}
            className="relative flex items-center justify-center w-full px-6 py-3.5 bg-white border border-border-default rounded-xl text-text-primary font-medium hover:bg-brand-tint hover:border-brand-500 transition-all duration-200 shadow-xs group"
          >
            <div className="absolute left-5 flex items-center pointer-events-none">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary text-center">Continue with Google</span>
          </a>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-border-default w-full" />
            <span className="bg-white px-3 text-xs text-text-muted uppercase tracking-wider font-semibold">Or</span>
            <div className="border-t border-border-default w-full" />
          </div>

          <button
            type="button"
            disabled={demoLoading}
            onClick={async () => {
              try {
                setDemoLoading(true);
                await devLogin('demo@reachinbox.ai', 'ReachInbox Demo User');
                window.location.href = '/dashboard';
              } catch (err: any) {
                alert(err.message || 'Login failed');
                setDemoLoading(false);
              }
            }}
            style={{ backgroundColor: '#00A63E', color: '#FFFFFF' }}
            className="relative flex items-center justify-center w-full px-6 py-3.5 bg-[#00A63E] hover:bg-[#008a34] text-white font-semibold text-sm rounded-xl shadow-xs transition-all duration-200 cursor-pointer disabled:opacity-75"
          >
            <div className="absolute left-5 flex items-center pointer-events-none">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white text-center">
              {demoLoading ? 'Signing in...' : 'Continue as Demo User'}
            </span>
          </button>

          <p className="text-center text-xs text-text-muted">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
