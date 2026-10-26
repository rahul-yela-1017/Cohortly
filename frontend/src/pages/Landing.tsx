import React from 'react';
import { Link } from 'react-router-dom';

import Carousel from '../components/Carousel';
import { Logo } from '../components/ui';
import { IconChat, IconLock, IconNotes, IconShield, IconTeams, IconUsers } from '../components/icons';

const FEATURES = [
  { icon: IconUsers, title: 'Private class directory', text: 'Only students on your approved roster appear — search by name and view a limited profile before you say hi.' },
  { icon: IconChat, title: 'Real-time private chat', text: 'Instant delivery, history, timestamps, unread badges and read receipts — with graceful empty and locked states.' },
  { icon: IconTeams, title: 'Teams & invitations', text: 'Invite classmates to project teams. Chats and files unlock only after an invite is accepted.' },
  { icon: IconNotes, title: 'Notes, Q&A & events', text: 'Course-wise notes and PDFs, questions with accepted answers, study groups, and one calendar for every deadline.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Logo size={32} />
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link to="/login" className="btn-primary !py-2 whitespace-nowrap">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-gradient-to-br from-brand-100 via-brand-50 to-accent-50 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="chip mb-6 bg-brand-50 text-brand-700">
              <IconShield className="h-3.5 w-3.5" /> Built for one class. Private by design.
            </span>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              Your class, connected — <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">privately</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Cohortly is the home for your college class: find classmates, message them end-to-end encrypted, build project teams, share notes
              and never miss a deadline. Verified roster only — no strangers, no noise.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login" className="btn-primary w-full !px-7 !py-3 text-base sm:w-auto">
                Log in
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Your account is already on the class roster — first-time password is your roll number in CAPITAL letters.
            </p>
          </div>
        </section>

        {/* Carousel */}
        <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6" aria-labelledby="tour-heading">
          <h2 id="tour-heading" className="sr-only">
            Feature tour
          </h2>
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-card">
            <Carousel />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Everything your class needs, in one place
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-pop motion-reduce:hover:translate-y-0">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section className="border-y border-slate-100 bg-slate-50/70">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="chip mb-4 bg-accent-50 text-accent-700">
                <IconLock className="h-3.5 w-3.5" /> End-to-end encryption
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Messages only you can read</h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                Private and team messages — including attachments — are encrypted on your device with OpenPGP (the established open standard, RFC
                9580) before they ever leave it. Your private key is generated in the browser and stored encrypted; our servers and database hold
                ciphertext only.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                {['Keypairs created on-device at signup', 'Server & database store ciphertext, never keys', 'Attachments encrypted before upload', 'Verified roster keeps the class private'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-4.5 w-4.5 h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">What the server stores</p>
              <div className="space-y-3 font-mono text-[11px] leading-relaxed">
                <div className="rounded-xl bg-slate-900 p-4 text-accent-300">
                  <p className="text-slate-500">// message document (MongoDB)</p>
                  <p>{'{ conversation: "…", sender: "…",'}</p>
                  <p className="break-all">
                    &nbsp;&nbsp;ciphertext: <span className="text-accent-300">"-----BEGIN PGP MESSAGE----- hQEMA…"</span>,
                  </p>
                  <p>{'  read_by: […], created_at: … }'}</p>
                </div>
                <p className="text-slate-500">Plaintext exists only in participants’ browsers, after local decryption.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Ready to join your classmates?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
            Log in with your college email — your first-time password is your roll number in CAPITAL letters.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/login" className="btn-primary w-full !px-7 !py-3 text-base sm:w-auto">
              Log in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo size={26} />
          <p className="text-xs text-slate-400">Made with care for your class · End-to-end encrypted with OpenPGP</p>
        </div>
      </footer>
    </div>
  );
}
