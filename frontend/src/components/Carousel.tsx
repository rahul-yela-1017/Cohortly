import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar } from './ui';
import { IconChat, IconChevronLeft, IconChevronRight, IconLock, IconNotes, IconTeams, IconUsers } from './icons';

/* ------------------------------------------------------------------ slides */

function DirectoryVisual() {
  const people = [
    { n: 'Diya Iyer', r: 'SYN-1002', c: '#14b8a6', b: 'DBMS nerd…' },
    { n: 'Rohan Das', r: 'SYN-1003', c: '#f59e0b', b: 'Full-stack tinkerer' },
    { n: 'Ananya Rao', r: 'SYN-1004', c: '#ec4899', b: 'OS + networks' },
  ];
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-pop">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-400">
        <IconUsers className="h-4 w-4" /> Search classmates…
      </div>
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.r} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
            <Avatar name={p.n} color={p.c} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{p.n}</p>
              <p className="truncate text-xs text-slate-500">{p.b}</p>
            </div>
            <span className="chip bg-brand-50 text-brand-700">Message</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatVisual() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-pop">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name="Diya Iyer" color="#14b8a6" size={30} />
          <p className="text-sm font-semibold text-slate-800">Diya Iyer</p>
        </div>
        <span className="chip bg-accent-50 text-accent-700">
          <IconLock className="h-3 w-3" /> E2EE
        </span>
      </div>
      <div className="space-y-2">
        <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-700">Did you finish the OS assignment?</p>
        <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">Almost — sending you my notes now 🔒</p>
        <div className="ml-auto flex w-fit items-center gap-2 rounded-2xl rounded-br-md bg-brand-600/95 px-3.5 py-2 text-sm text-white">
          <IconNotes className="h-4 w-4" /> os-unit4.pdf
        </div>
        <p className="text-right text-[11px] text-slate-400">Read · 9:41 pm</p>
      </div>
    </div>
  );
}

function TeamsVisual() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-pop">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">DBMS Project Squad</p>
        <span className="chip bg-slate-100 text-slate-600">4 members</span>
      </div>
      <div className="mb-3 flex -space-x-2">
        {['#6366f1', '#14b8a6', '#f59e0b', '#ec4899'].map((c, i) => (
          <Avatar key={c} name={'ABCD'[i] + ' Member'} color={c} size={34} className="ring-2 ring-white" />
        ))}
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 ring-2 ring-white">
          +2
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-slate-600">Invite → Kabir</span>
          <span className="chip bg-amber-50 text-amber-700">Pending</span>
        </li>
        <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-slate-600">Invite → Meera</span>
          <span className="chip bg-accent-50 text-accent-700">Accepted</span>
        </li>
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
        <IconTeams className="h-4 w-4" /> Team chat & files unlock after accepting
      </div>
    </div>
  );
}

function NotesVisual() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-pop">
      <div className="mb-3 flex items-center gap-2">
        <span className="chip bg-brand-50 text-brand-700">DBMS</span>
        <span className="chip bg-accent-50 text-accent-700">Operating Systems</span>
      </div>
      <ul className="space-y-2">
        {[
          { t: 'Indexing & B+ trees summary', m: 'PDF · 240 KB' },
          { t: 'OS scheduling cheat-sheet', m: 'Markdown note' },
          { t: 'CN unit 2 mind-map', m: 'PNG · 1.1 MB' },
        ].map((n) => (
          <li key={n.t} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconNotes className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{n.t}</p>
              <p className="text-xs text-slate-500">{n.m}</p>
            </div>
            <span className="text-xs font-semibold text-brand-600">Open</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SLIDES = [
  {
    id: 'directory',
    icon: IconUsers,
    headline: 'Find your classmates',
    text: 'A private directory of your approved class roster. Search by name, see a limited profile, and start a conversation — no strangers, ever.',
    Visual: DirectoryVisual,
  },
  {
    id: 'chat',
    icon: IconChat,
    headline: 'Message privately, end-to-end encrypted',
    text: 'One-to-one chats with read receipts, typing indicators and attachments. Messages are encrypted on your device — the server only stores ciphertext.',
    Visual: ChatVisual,
  },
  {
    id: 'teams',
    icon: IconTeams,
    headline: 'Create teams for projects & study',
    text: 'Invite classmates, track pending and accepted invites, and unlock a shared encrypted team chat and file space the moment they join.',
    Visual: TeamsVisual,
  },
  {
    id: 'notes',
    icon: IconNotes,
    headline: 'Share notes that stay organised',
    text: 'Upload PDFs and resources by course and topic, ask questions with accepted answers, and never lose a study file in a group chat again.',
    Visual: NotesVisual,
  },
];

/* ------------------------------------------------------------------ carousel */

const AUTOPLAY_MS = 8000;

export default function Carousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touched = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);

  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused || touched.current || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, reduced, index]);

  const interact = (fn: () => void) => {
    touched.current = true; // user took control: stop autoplay for good
    fn();
  };

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Feature introduction"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        role="group"
        aria-live={paused || touched.current ? 'polite' : 'off'}
        className="overflow-hidden rounded-3xl"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') interact(() => go(index - 1));
          if (e.key === 'ArrowRight') interact(() => go(index + 1));
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map(({ id, icon: Icon, headline, text, Visual }, i) => (
            <div
              key={id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${headline}`}
              aria-hidden={i !== index}
              className="grid w-full shrink-0 items-center gap-8 p-6 sm:p-10 lg:grid-cols-2"
            >
              <div className="order-2 lg:order-1">
                <span className="chip mb-4 bg-brand-50 text-brand-700">
                  <Icon className="h-3.5 w-3.5" />
                  {['Directory', 'Private chat', 'Teams', 'Notes & Q&A'][i]}
                </span>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{headline}</h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 sm:text-base">{text}</p>
              </div>
              <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
                <Visual />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => interact(() => go(index - 1))}
          className="btn-secondary !rounded-full !p-2.5"
          aria-label="Previous slide"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2" role="tablist" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}: ${s.headline}`}
              onClick={() => interact(() => go(i))}
              className={`h-2.5 rounded-full transition-all ${i === index ? 'w-7 bg-brand-600' : 'w-2.5 bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => interact(() => go(index + 1))}
          className="btn-secondary !rounded-full !p-2.5"
          aria-label="Next slide"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
