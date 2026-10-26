import React, { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { relative } from '../lib/time';
import type { Comment, Post } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, KindChip, LoadingBlock, PageHeader, Spinner } from '../components/ui';
import { IconFeed, IconSend } from '../components/icons';

const KINDS: { value: Post['kind']; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'update', label: 'Update' },
  { value: 'question', label: 'Question' },
];

export default function Feed() {
  const { user } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<Post['kind']>('update');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'fresh' | 'more') => {
      if (mode === 'fresh') setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const before = mode === 'more' && cursor ? `&before=${cursor}` : '';
        const data = await api<{ posts: Post[]; next_cursor: string | null }>(`/posts?limit=15${before}`);
        setPosts((prev) => (mode === 'more' ? [...prev, ...data.posts] : data.posts));
        setCursor(data.next_cursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the feed.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor],
  );

  useEffect(() => {
    void load('fresh');
  }, [load]);

  return (
    <>
      <PageHeader title="Class feed" subtitle="Announcements, questions and updates from your classmates." />

      {/* Composer */}
      <div className="card mb-6 p-4 sm:p-5">
        <div className="flex gap-3">
          <Avatar name={user?.name || ''} color={user?.avatar_color} size={40} />
          <div className="flex-1">
            <div className="mb-2.5 flex gap-1.5" role="radiogroup" aria-label="Post type">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={`chip transition ${kind === k.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {kind === 'question' && (
              <input className="input mb-2" placeholder="Question title (short and specific)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
            )}
            <textarea
              className="input min-h-[76px] resize-y"
              placeholder={kind === 'announcement' ? 'Share an announcement with the class…' : kind === 'question' ? 'Add details so classmates can help…' : 'What’s new?'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
            />
            <div className="mt-2.5 flex items-center justify-between">
              <p className="text-xs text-slate-400">{body.length}/4000</p>
              <button
                type="button"
                className="btn-primary !py-2"
                disabled={posting || !body.trim() || (kind === 'question' && !title.trim())}
                onClick={async () => {
                  setPosting(true);
                  try {
                    const { post } = await api<{ post: Post }>('/posts', { method: 'POST', body: { kind, body, title, course: '' } });
                    setPosts((prev) => [post, ...prev]);
                    setBody('');
                    setTitle('');
                    toast('Posted to the class feed.', 'success');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Post failed.', 'error');
                  } finally {
                    setPosting(false);
                  }
                }}
              >
                {posting ? <Spinner className="h-4 w-4" /> : <IconSend className="h-4 w-4" />} Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load('fresh')} />
      ) : posts.length === 0 ? (
        <EmptyState icon={<IconFeed className="h-8 w-8" />} title="The feed is quiet" hint="Be the first to share an announcement, update or question with your class." />
      ) : (
        <ul className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} openComments={openComments === post.id} toggleComments={() => setOpenComments((c) => (c === post.id ? null : post.id))} onDeleted={() => setPosts((p) => p.filter((x) => x.id !== post.id))} />
          ))}
          {cursor && (
            <div className="pt-2 text-center">
              <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => void load('more')} disabled={loadingMore}>
                {loadingMore ? <Spinner className="h-3.5 w-3.5" /> : null} Load older posts
              </button>
            </div>
          )}
        </ul>
      )}
    </>
  );
}

function PostCard({ post, openComments, toggleComments, onDeleted }: { post: Post; openComments: boolean; toggleComments: () => void; onDeleted: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!openComments || loaded) return;
    void (async () => {
      const data = await api<{ comments: Comment[] }>(`/posts/${post.id}/comments?limit=50`);
      setComments(data.comments);
      setLoaded(true);
    })();
  }, [openComments, loaded, post.id]);

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} color={post.author.avatar_color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-slate-900">{post.author.name}</p>
            <span className="text-xs text-slate-400">· {relative(post.created_at)}</span>
            <KindChip kind={post.kind} />
            {post.course && <span className="chip bg-slate-100 text-slate-600">{post.course}</span>}
          </div>
          {post.title && <h3 className="mt-2 text-base font-semibold text-slate-900">{post.title}</h3>}
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post.body}</p>
          <div className="mt-3 flex items-center gap-4 text-xs font-medium text-slate-500">
            <button type="button" className="hover:text-brand-600" onClick={toggleComments} aria-expanded={openComments}>
              {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
            </button>
            {post.kind === 'question' && (
              <span className={post.accepted_reply_id ? 'text-accent-600' : ''}>
                {post.accepted_reply_id ? '✓ Answered' : `${post.reply_count} replies`}
              </span>
            )}
            {post.author.id === user?.id && (
              <button
                type="button"
                className="ml-auto text-slate-400 hover:text-rose-600"
                onClick={async () => {
                  try {
                    await api(`/posts/${post.id}`, { method: 'DELETE' });
                    onDeleted();
                    toast('Post deleted.', 'info');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>

          {openComments && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet — start the conversation.</p>}
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.author.name} color={c.author.avatar_color} size={28} />
                  <div className="rounded-2xl bg-slate-50 px-3.5 py-2">
                    <p className="text-xs font-semibold text-slate-800">{c.author.name}</p>
                    <p className="text-sm text-slate-700">{c.body}</p>
                  </div>
                </div>
              ))}
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  try {
                    const { comment } = await api<{ comment: Comment }>(`/posts/${post.id}/comments`, { method: 'POST', body: { body: draft } });
                    setComments((prev) => [...prev, comment]);
                    setDraft('');
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Comment failed.', 'error');
                  }
                }}
              >
                <input className="input !py-2 text-sm" placeholder="Write a comment…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} aria-label="Comment" />
                <button type="submit" className="btn-secondary !px-3 !py-2" aria-label="Send comment" disabled={!draft.trim()}>
                  <IconSend className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
