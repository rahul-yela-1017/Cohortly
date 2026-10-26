import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import AppShell from './components/AppShell';
import { useAuth } from './context/AuthContext';
import { Forgot, Login, Reset } from './pages/AuthPages';
import Chat from './pages/Chat';
import Directory from './pages/Directory';
import Events from './pages/Events';
import Feed from './pages/Feed';
import Groups from './pages/Groups';
import Landing from './pages/Landing';
import Notes from './pages/Notes';
import Profile from './pages/Profile';
import QA from './pages/QA';
import TeamDetail from './pages/TeamDetail';
import Teams from './pages/Teams';
import { Spinner } from './components/ui';

function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <img src="/logo.png" alt="" className="h-12 w-12 animate-pulse rounded-xl" />
        <Spinner className="h-5 w-5" />
        <span className="sr-only">Loading Cohortly…</span>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <BootSplash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <AppShell>{children}</AppShell>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RedirectIfAuthed><Landing /></RedirectIfAuthed>} />
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/forgot-password" element={<RedirectIfAuthed><Forgot /></RedirectIfAuthed>} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="/app" element={<RequireAuth><Feed /></RequireAuth>} />
      <Route path="/app/directory" element={<RequireAuth><Directory /></RequireAuth>} />
      <Route path="/app/chat" element={<RequireAuth><Chat /></RequireAuth>} />
      <Route path="/app/chat/:convId" element={<RequireAuth><Chat /></RequireAuth>} />
      <Route path="/app/teams" element={<RequireAuth><Teams /></RequireAuth>} />
      <Route path="/app/teams/:teamId" element={<RequireAuth><TeamDetail /></RequireAuth>} />
      <Route path="/app/qa" element={<RequireAuth><QA /></RequireAuth>} />
      <Route path="/app/qa/:questionId" element={<RequireAuth><QA /></RequireAuth>} />
      <Route path="/app/notes" element={<RequireAuth><Notes /></RequireAuth>} />
      <Route path="/app/groups" element={<RequireAuth><Groups /></RequireAuth>} />
      <Route path="/app/events" element={<RequireAuth><Events /></RequireAuth>} />
      <Route path="/app/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
