import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../lib/api';
import { relative } from '../lib/time';
import type { Post, Reply } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, Spinner } from '../components/ui';
import { IconArrowLeft, IconCheck, IconPlus, IconQA } from '../components/icons';

export default function QA() {
  const { questionId } = useParams();
  return questionId ? <QuestionDetail id={questionId} /> : <QuestionList />;
}

/* ------------------------------------------------------------------ list */

function QuestionList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [questions, setQuestions] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'' | 'open' | 'answered'>('');
  const [askOpen, setAskOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ questions: Post[] }>(`/questions?limit=30${status ? `&status=${status}` : ''}`);
      setQuestions(data.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load questions.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Course Q&A"
        subtitle="Ask the class, answer a classmate, and mark the reply that helped."
        action={
          <button type="button" className="btn-primary" onClick={() => setAskOpen(true)}>
            <IconPlus className="h-4 w-4" /> Ask a question
          </button>
        }
      />

      <div className="mb-5 flex gap-1.5" role="radiogroup" aria-label="Filter questions">
        {[
          { v: '' as const, l: 'All' },
          { v: 'open' as const, l: 'Needs an answer' },
          { v: 'answered' as const, l: 'Answered' },
        ].map((f) => (
          <button
            key={f.v || 'all'}
            type="button"
            role="radio"
            aria-checked={status === f.v}
            onClick={() => setStatus(f.v)}
            className={`chip transition ${status === f.v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : questions.length === 0 ? (
        <EmptyState icon={<IconQA className="h-8 w-8" />} title="No questions here yet" hint="Ask the first question — someone in class probably wondered the same thing." />
      ) : (
        <ul className="space-y-3">
          {questions.map((q) => (
            <li key={q.id}>
              <button type="button" onClick={() => navigate(`/app/qa/${q.id}`)} className="card block w-full p-4 text-left transition hover:shadow-pop sm:p-5">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${q.accepted_reply_id ? 'bg-accent-50 text-accent-600' : 'bg-amber-50 text-amber-600'}`}>
                    {q.accepted_reply_id ? <IconCheck className="h-4 w-4" /> : <IconQA className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{q.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{q.body}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <Avatar name={q.author.name} color={q.author.avatar_color} size={18} />
                      {q.author.name} · {relative(q.created_at)}
                      {q.course && <span className="chip bg-slate-100 text-slate-600">{q.course}</span>}
                      <span className="ml-auto">{q.reply_count} replies</span>
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={askOpen} onClose={() => setAskOpen(false)} title="Ask the class">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { post } = await api<{ post: Post }>('/posts', { method: 'POST', body: { kind: 'question', title, body, course } });
              setAskOpen(false);
              setTitle('');
              setBody('');
              setCourse('');
              navigate(`/app/qa/${post.id}`);
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Could not post question.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="qtitle">Title</label>
            <input id="qtitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="How do B+ trees handle bulk loading?" required />
          </div>
          <div>
            <label className="label" htmlFor="qcourse">Course <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="qcourse" className="input" value={course} onChange={(e) => setCourse(e.target.value)} maxLength={60} placeholder="DBMS" />
          </div>
          <div>
            <label className="label" htmlFor="qbody">Details</label>
            <textarea id="qbody" className="input min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="What did you try? What confused you?" required />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || !title.trim() || !body.trim()}>
            {busy && <Spinner className="h-4 w-4" />} Post question
          </button>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ detail */

function QuestionDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [question, setQuestion] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ question: Post }>(`/questions/${id}`);
      setQuestion(data.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Question unavailable.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock rows={3} />;
  if (error || !question) return <ErrorState message={error || 'Not found.'} onRetry={() => void load()} />;

  const isAuthor = question.author.id === user?.id;
  const sorted = [...(question.replies || [])].sort((a, b) => Number(b.is_accepted) - Number(a.is_accepted));

  return (
    <>
      <button type="button" className="btn-ghost mb-4 !px-2" onClick={() => navigate('/app/qa')}>
        <IconArrowLeft className="h-4 w-4" /> All questions
      </button>

      <article className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Avatar name={question.author.name} color={question.author.avatar_color} size={24} />
          <span className="font-medium text-slate-700">{question.author.name}</span> · {relative(question.created_at)}
          {question.course && <span className="chip bg-slate-100 text-slate-600">{question.course}</span>}
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">{question.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{question.body}</p>
      </article>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">
        {sorted.length} repl{sorted.length === 1 ? 'y' : 'ies'}
      </h2>
      <ul className="space-y-3">
        {sorted.map((r) => (
          <li key={r.id} className={`card p-4 sm:p-5 ${r.is_accepted ? 'border-accent-300 ring-1 ring-accent-200' : ''}`}>
            <div className="flex items-start gap-3">
              <Avatar name={r.author.name} color={r.author.avatar_color} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{r.author.name}</p>
                  <span className="text-xs text-slate-400">{relative(r.created_at)}</span>
                  {r.is_accepted && (
                    <span className="chip bg-accent-50 text-accent-700">
                      <IconCheck className="h-3 w-3" /> Helpful answer
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.body}</p>
                {isAuthor && !r.is_accepted && (
                  <button
                    type="button"
                    className="mt-2.5 text-xs font-semibold text-accent-600 hover:text-accent-700"
                    onClick={async () => {
                      try {
                        await api(`/replies/${r.id}/accept`, { method: 'POST', body: {} });
                        toast('Marked as the helpful answer.', 'success');
                        void load();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Could not accept reply.', 'error');
                      }
                    }}
                  >
                    Mark as helpful answer
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="card mt-6 p-4 sm:p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setBusy(true);
          try {
            await api(`/questions/${id}/replies`, { method: 'POST', body: { body: draft } });
            setDraft('');
            toast('Reply posted.', 'success');
            void load();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Reply failed.', 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="label" htmlFor="reply">Your answer</label>
        <textarea id="reply" className="input min-h-[90px]" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} placeholder="Share what worked — links and worked examples welcome." />
        <div className="mt-3 flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>
            {busy && <Spinner className="h-4 w-4" />} Post reply
          </button>
        </div>
      </form>
    </>
  );
}
