import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Logo, Modal, Spinner } from './ui';
import {
  IconCalendar,
  IconChat,
  IconFeed,
  IconLock,
  IconLogout,
  IconMenu,
  IconNotes,
  IconQA,
  IconSettings,
  IconTeams,
  IconUser,
  IconUsers,
  IconX,
} from './icons';

const NAV = [
  { to: '/app', label: 'Class feed', icon: IconFeed, end: true },
  { to: '/app/directory', label: 'Classmates', icon: IconUsers },
  { to: '/app/chat', label: 'Messages', icon: IconChat },
  { to: '/app/teams', label: 'Teams', icon: IconTeams },
  { to: '/app/qa', label: 'Course Q&A', icon: IconQA },
  { to: '/app/notes', label: 'Notes & resources', icon: IconNotes },
  { to: '/app/groups', label: 'Study groups', icon: IconUser },
  { to: '/app/events', label: 'Events & deadlines', icon: IconCalendar },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, classInfo, loading, keyring, unlock, logout, regenerateKeys } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [regen, setRegen] = useState(false);

  useEffect(() => setDrawer(false), [children]);

  // Auto-prompt for unlock/setup once boot settles with the keyring not ready,
  // so a locked app never sits in a confusing dead-keyboard state. Prompt once
  // per locked episode; dismissing is respected until the state changes again.
  const prompted = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (keyring === 'ready') {
      prompted.current = false;
      // Never leave a stale unlock/setup dialog open once keys are ready.
      setUnlockOpen(false);
      return;
    }
    if (!prompted.current) {
      prompted.current = true;
      setUnlockOpen(true);
    }
  }, [loading, keyring]);

  // Any component can request the unlock dialog (e.g. clicking the chat
  // composer while keys are locked).
  useEffect(() => {
    const onRequest = () => setUnlockOpen(true);
    window.addEventListener('cc:unlock-requested', onRequest);
    return () => window.removeEventListener('cc:unlock-requested', onRequest);
  }, []);

  if (!user) return null;

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Logo size={30} />
        <button type="button" className="btn-ghost lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu">
          <IconX className="h-5 w-5" />
        </button>
      </div>
      {nav}
      <div className="m-3 rounded-2xl bg-slate-100/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your class</p>
        <p className="mt-1 text-sm font-semibold text-slate-800">{classInfo?.class_code}</p>
        <p className="text-xs text-slate-500">{classInfo?.class_name}</p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">{sidebarInner}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-pop animate-fade-in">{sidebarInner}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button type="button" className="btn-ghost lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
                <IconMenu className="h-5 w-5" />
              </button>
              <span className="hidden sm:block">
                <Logo size={28} />
              </span>
              <span className="chip bg-brand-50 text-brand-700 sm:hidden">{classInfo?.class_code}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => keyring !== 'ready' && setUnlockOpen(true)}
                title={keyring === 'ready' ? 'End-to-end encryption active on this device' : 'Encryption keys locked'}
                className={`chip gap-1.5 ${keyring === 'ready' ? 'bg-accent-50 text-accent-700' : 'bg-amber-50 text-amber-700'}`}
              >
                <IconLock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{keyring === 'ready' ? 'E2EE active' : keyring === 'locked' ? 'Keys locked' : 'Set up E2EE'}</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2 rounded-full p-0.5 transition hover:ring-2 hover:ring-brand-200"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  aria-label="Account menu"
                >
                  <Avatar name={user.name} color={user.avatar_color} size={34} />
                </button>
                {menu && (
                  <>
                    <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                    <div role="menu" className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-fade-up">
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">Roll {user.roll_number}</p>
                      </div>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenu(false); navigate('/app/profile'); }}>
                        <IconSettings className="h-4 w-4" /> Profile & privacy
                      </button>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setMenu(false); setUnlockOpen(true); }}>
                        <IconLock className="h-4 w-4" /> Encryption keys
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                        onClick={async () => {
                          setMenu(false);
                          await logout();
                          navigate('/');
                          toast('Signed out. See you soon!', 'info');
                        }}
                      >
                        <IconLogout className="h-4 w-4" /> Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {keyring !== 'ready' && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:px-6">
              {keyring === 'locked'
                ? 'Your encryption keys are locked — private messages stay ciphertext until you unlock them.'
                : 'End-to-end encryption isn’t set up on this device yet.'}{' '}
              <button type="button" onClick={() => setUnlockOpen(true)} className="underline underline-offset-2 hover:text-amber-900">
                {keyring === 'locked' ? 'Unlock now' : 'Set up now'}
              </button>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <Modal open={unlockOpen} onClose={() => setUnlockOpen(false)} title={keyring === 'setup' ? 'Set up end-to-end encryption' : 'Unlock your keys'}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await unlock(password);
            setBusy(false);
            if (ok) {
              setUnlockOpen(false);
              setPassword('');
              toast('Keys unlocked on this device.', 'success');
            } else {
              toast('That password didn’t unlock your keys.', 'error');
            }
          }}
        >
          <p className="text-sm text-slate-600">
            Your private key never leaves this device in plaintext. Enter your account password to decrypt it locally — the server only ever sees
            ciphertext.
          </p>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Account password"
            aria-label="Account password"
          />
          <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {keyring === 'setup' ? 'Create my keys' : 'Unlock'}
          </button>
          {keyring === 'locked' && (
            regen ? (
              <form
                className="space-y-2 border-t border-slate-100 pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const ok = await regenerateKeys(password);
                  setBusy(false);
                  if (ok) {
                    setUnlockOpen(false);
                    setRegen(false);
                    setPassword('');
                    toast('New keys created. Older messages stay unreadable — that’s how E2EE works.', 'info');
                  } else toast('Could not create new keys.', 'error');
                }}
              >
                <p className="text-xs text-rose-600">
                  This replaces your keypair. Messages sent before this moment can no longer be decrypted on any device.
                </p>
                <button type="submit" className="btn-danger w-full" disabled={busy || !password}>
                  Confirm: create new keys
                </button>
              </form>
            ) : (
              <button type="button" className="w-full text-center text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700" onClick={() => setRegen(true)}>
                Forgot your old password? Start over with new keys
              </button>
            )
          )}
        </form>
      </Modal>
    </div>
  );
}
