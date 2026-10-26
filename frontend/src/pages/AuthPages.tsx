import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { FieldError, Logo, Spinner } from '../components/ui';
import { IconArrowLeft, IconShield } from '../components/icons';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex" aria-label="Back to home">
          <Logo size={30} />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
            <IconArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ login */

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with your college email to reach your class directory, messages and notes.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            await login(identifier, password);
            toast('Welcome back!', 'success');
            navigate('/app');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="identifier">College email</label>
          <input id="identifier" className="input" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@college.edu" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
          <span>
            First time logging in? Your initial password is your{' '}
            <strong className="font-semibold text-slate-700">roll number in CAPITAL letters</strong> (for example{' '}
            <code className="font-mono text-slate-700">25MVCSMR0545</code>). You can change it from your profile afterwards.
          </span>
        </p>
        <FieldError>{error}</FieldError>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Log in
        </button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">Forgot password?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

/* ------------------------------------------------------------------ forgot / reset */

export function Forgot() {
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <AuthLayout title="Reset your password" subtitle="We’ll send a reset link to your college email on file.">
      {sent ? (
        <div className="rounded-2xl bg-accent-50 p-4 text-sm leading-relaxed text-accent-800">
          If that account exists and is activated, a reset link is on its way. The link expires in 30 minutes. Check spam if it doesn’t arrive.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api('/auth/forgot-password', { method: 'POST', body: { identifier } });
              setSent(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Request failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="fid">Roll number or email</label>
            <input id="fid" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@college.edu" required />
          </div>
          <FieldError>{error}</FieldError>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Send reset link
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link" subtitle="This link is missing its token. Request a new one below.">
        <Link to="/forgot-password" className="btn-primary w-full">Request a new link</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="At least 8 characters. You’ll be logged out of other devices.">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-accent-50 p-4 text-sm text-accent-800">Password updated. Log in with your new password.</div>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/login')}>Go to login</button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            if (password !== confirm) return setError('Passwords don’t match.');
            setBusy(true);
            try {
              await api('/auth/reset-password', { method: 'POST', body: { token, password } });
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Reset failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="np">New password</label>
            <input id="np" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="npc">Confirm new password</label>
            <input id="npc" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <FieldError>{error}</FieldError>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Update password
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
