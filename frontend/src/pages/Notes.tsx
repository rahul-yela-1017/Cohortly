import React, { useCallback, useEffect, useRef, useState } from 'react';

import { api, downloadFile, saveBlob } from '../lib/api';
import { relative } from '../lib/time';
import type { Note } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, Spinner } from '../components/ui';
import { IconDownload, IconFile, IconNotes, IconPlus, IconSearch } from '../components/icons';

export default function Notes() {
  const { user } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', course: '', topics: '', link: '', body: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (q) params.set('q', q);
      if (course) params.set('course', course);
      const data = await api<{ notes: Note[] }>(`/notes?${params}`);
      setNotes(data.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, [q, course]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const courses = Array.from(new Set(notes.map((n) => n.course).filter(Boolean)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let fileId: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('scope_type', 'class');
        fd.append('scope_ref', 'class'); // replaced server-side? no: class scope uses class id; server validates membership only
        const { file: meta } = await api<{ file: { id: string } }>('/files', { method: 'POST', form: fd });
        fileId = meta.id;
      }
      await api('/notes', {
        method: 'POST',
        body: {
          title: form.title,
          description: form.description,
          course: form.course || 'General',
          topics: form.topics.split(',').map((t) => t.trim()).filter(Boolean),
          link: form.link,
          body: form.body,
          file_id: fileId,
        },
      });
      setCreateOpen(false);
      setForm({ title: '', description: '', course: '', topics: '', link: '', body: '' });
      setFile(null);
      toast('Note shared with the class.', 'success');
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not share note.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Notes & resources"
        subtitle="Course-wise notes, PDFs and links shared by your class."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus className="h-4 w-4" /> Share a note
          </button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-10" placeholder="Search notes by title…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </div>
        <select className="input sm:w-52" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter by course">
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : notes.length === 0 ? (
        <EmptyState icon={<IconNotes className="h-8 w-8" />} title="No notes yet" hint="Share the first note, PDF or resource for your class." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id} className="card flex flex-col p-5">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                <span className="chip bg-brand-50 text-brand-700">{n.course}</span>
                {n.topics.slice(0, 2).map((t) => (
                  <span key={t} className="chip bg-slate-100 text-slate-600">
                    {t}
                  </span>
                ))}
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
              {n.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.description}</p>}
              {n.body && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{n.body}</p>}
              {n.link && (
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="mt-2 truncate text-sm font-medium text-brand-600 hover:underline">
                  {n.link}
                </a>
              )}
              <div className="mt-auto pt-4">
                {n.file && (
                  <button
                    type="button"
                    className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                    onClick={async () => {
                      try {
                        const blob = await downloadFile(n.file!.id);
                        saveBlob(blob, n.file!.filename);
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Download failed.', 'error');
                      }
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <IconFile className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{n.file.filename}</span>
                      <span className="block text-xs text-slate-500">{(n.file.size / 1024).toFixed(0)} KB</span>
                    </span>
                    <IconDownload className="h-4 w-4 text-slate-400" />
                  </button>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Avatar name={n.owner.name} color={n.owner.avatar_color} size={20} />
                  {n.owner.name} · {relative(n.created_at)}
                  {n.owner.id === user?.id && (
                    <button
                      type="button"
                      className="ml-auto hover:text-rose-600"
                      onClick={async () => {
                        try {
                          await api(`/notes/${n.id}`, { method: 'DELETE' });
                          toast('Note deleted.', 'info');
                          void load();
                        } catch (e) {
                          toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Share a note or resource" wide>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ntitle">Title</label>
              <input id="ntitle" className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={140} required />
            </div>
            <div>
              <label className="label" htmlFor="ncourse">Course</label>
              <input id="ncourse" className="input" value={form.course} onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))} maxLength={60} placeholder="DBMS" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ndesc">Short description</label>
            <input id="ndesc" className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={600} />
          </div>
          <div>
            <label className="label" htmlFor="ntopics">Topics <span className="font-normal text-slate-400">(comma separated)</span></label>
            <input id="ntopics" className="input" value={form.topics} onChange={(e) => setForm((f) => ({ ...f, topics: e.target.value }))} placeholder="indexing, b+trees" />
          </div>
          <div>
            <span className="label">Attachment <span className="font-normal text-slate-400">(PDF, docs, images, zip — max 25 MB)</span></span>
            <input ref={fileRef} type="file" className="input !py-2" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Note attachment" />
            {file && <p className="mt-1 text-xs text-slate-500">{file.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="nlink">Or a link</label>
            <input id="nlink" className="input" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://…" maxLength={400} />
          </div>
          <div>
            <label className="label" htmlFor="nbody">Or write the note inline</label>
            <textarea id="nbody" className="input min-h-[90px]" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} maxLength={20000} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Share with class
          </button>
        </form>
      </Modal>
    </>
  );
}
