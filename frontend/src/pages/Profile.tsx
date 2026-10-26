import React, { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { clearKeyCache, fingerprint, lockKeyring, rotateKeyPassphrase } from '../lib/crypto';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, FieldError, PageHeader, Spinner } from '../components/ui';
import { IconLock, IconLogout, IconShield } from '../components/icons';

const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#22c55e', '#ef4444'];

export default function Profile() {
  const { user, refresh, keyring, logout } = useAuth();
  const toast = useToast();
  const [bio, setBio] = useState(user?.bio || '');
  const [color, setColor] = useState(user?.avatar_color || COLORS[0]);
  const [showEmail, setShowEmail] = useState(user?.privacy?.show_email ?? false);
  const [showBio, setShowBio] = useState(user?.privacy?.show_bio ?? true);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [fp, setFp] = useState('');

  useEffect(() => {
    void fingerprint().then(setFp);
  }, [keyring]);

  if (!user) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/me', { method: 'PATCH', body: { bio, avatar_color: color, privacy: { show_email: showEmail, show_bio: showBio } } });
      await refresh();
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile & settings" subtitle="Control what classmates see, and manage your password and encryption keys." />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile card */}
        <section className="card p-5 lg:col-span-2 sm:p-6" aria-labelledby="profile-h">
          <h2 id="profile-h" className="mb-5 text-sm font-semibold text-slate-800">Public-to-class profile</h2>
          <div className="mb-6 flex items-center gap-4">
            <Avatar name={user.name} color={color} size={64} />
            <div>
              <p className="text-base font-semibold text-slate-900">{user.name}</p>
              <p className="text-sm text-slate-500">Roll {user.roll_number}</p>
              {user.email && <p className="text-xs text-slate-400">{user.email}</p>}
            </div>
          </div>
          <form className="space-y-5" onSubmit={saveProfile}>
            <div>
              <span className="label">Avatar colour</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar colour">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="bio">Bio <span className="font-normal text-slate-400">({bio.length}/280)</span></label>
              <textarea id="bio" className="input min-h-[80px]" value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} placeholder="Tell your class a little about yourself…" />
            </div>
            <fieldset className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">Privacy</legend>
              <label className="flex items-center justify-between gap-4 text-sm text-slate-700">
                Show my bio to classmates
                <input type="checkbox" className="h-4.5 w-4.5 h-5 w-5 accent-brand-600" checked={showBio} onChange={(e) => setShowBio(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm text-slate-700">
                Show my email to classmates
                <input type="checkbox" className="h-4.5 w-4.5 h-5 w-5 accent-brand-600" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} />
              </label>
              <p className="text-xs text-slate-400">Your name and roll number are always visible to approved classmates.</p>
            </fieldset>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />} Save changes
            </button>
          </form>
        </section>

        <div className="space-y-6">
          {/* Security / E2EE */}
          <section className="card p-5" aria-labelledby="sec-h">
            <h2 id="sec-h" className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <IconShield className="h-4 w-4 text-accent-600" /> End-to-end encryption
            </h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Messages and chat attachments are encrypted on your device with OpenPGP before upload. The server stores ciphertext only.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Key status</dt>
                <dd className={`font-semibold ${keyring === 'ready' ? 'text-accent-600' : 'text-amber-600'}`}>
                  {keyring === 'ready' ? 'Active on this device' : keyring === 'locked' ? 'Locked' : 'Not set up'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Key ID</dt>
                <dd className="font-mono text-xs text-slate-700">{fp || '—'}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn-secondary w-full !py-2 text-xs"
                onClick={() => {
                  lockKeyring();
                  toast('Keys locked on this device.', 'info');
                }}
                disabled={keyring !== 'ready'}
              >
                <IconLock className="h-3.5 w-3.5" /> Lock keys on this device
              </button>
              <button
                type="button"
                className="btn-secondary w-full !py-2 text-xs"
                onClick={async () => {
                  await clearKeyCache(user.id);
                  toast('Local key cache cleared. Unlock with your password to read messages.', 'info');
                }}
              >
                Clear cached keys (this browser)
              </button>
            </div>
          </section>

          {/* Password */}
          <section className="card p-5" aria-labelledby="pw-h">
            <h2 id="pw-h" className="mb-4 text-sm font-semibold text-slate-800">Change password</h2>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setPwError('');
                if (pw.next !== pw.confirm) return setPwError('New passwords don’t match.');
                if (pw.next.length < 8) return setPwError('New password must be at least 8 characters.');
                setPwBusy(true);
                try {
                  await api('/auth/change-password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } });
                  // Keep E2EE consistent: re-wrap the private key with the new passphrase.
                  const rotated = await rotateKeyPassphrase(user.id, pw.next);
                  setPw({ current: '', next: '', confirm: '' });
                  toast(
                    rotated
                      ? 'Password changed and your encryption key was re-wrapped on this device.'
                      : 'Password changed, but re-wrapping your key failed — unlock keys from the banner.',
                    rotated ? 'success' : 'error',
                  );
                } catch (err) {
                  setPwError(err instanceof Error ? err.message : 'Change failed.');
                } finally {
                  setPwBusy(false);
                }
              }}
            >
              <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} aria-label="Current password" required />
              <input className="input" type="password" autoComplete="new-password" placeholder="New password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} aria-label="New password" required />
              <input className="input" type="password" autoComplete="new-password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} aria-label="Confirm new password" required />
              <FieldError>{pwError}</FieldError>
              <button type="submit" className="btn-primary w-full !py-2 text-xs" disabled={pwBusy}>
                {pwBusy && <Spinner className="h-3.5 w-3.5" />} Update password
              </button>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Your password also protects your encrypted private key. Changing it here automatically re-wraps the key on this device; other devices will ask for the new password once.
              </p>
            </form>
          </section>

          <button
            type="button"
            className="btn-secondary w-full"
            onClick={async () => {
              await logout();
              window.location.href = '/';
            }}
          >
            <IconLogout className="h-4 w-4" /> Log out
          </button>
        </div>
      </div>
    </>
  );
}
