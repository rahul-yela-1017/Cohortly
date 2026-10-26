import React from 'react';

type P = { className?: string };
const base = 'h-5 w-5';
const svg = (props: P, children: React.ReactNode, viewBox = '0 0 24 24') => (
  <svg
    className={props.className || base}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconFeed = (p: P) => svg(p, <><path d="M4 11a8 8 0 0 1 8-8" /><path d="M4 15a12 12 0 0 1 12-12" /><path d="M4 19a16 16 0 0 1 16-16" /><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" /></>);
export const IconUsers = (p: P) => svg(p, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
export const IconChat = (p: P) => svg(p, <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />);
export const IconTeams = (p: P) => svg(p, <><rect x="3" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" /><path d="M17.25 13.5v7.5M13.5 17.25H21" /></>);
export const IconQA = (p: P) => svg(p, <><circle cx="12" cy="12" r="9" /><path d="M9.4 9a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.3-2.6 3.6" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" /></>);
export const IconNotes = (p: P) => svg(p, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>);
export const IconCalendar = (p: P) => svg(p, <><rect x="3" y="4" width="18" height="18" rx="2.5" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const IconUser = (p: P) => svg(p, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
export const IconSearch = (p: P) => svg(p, <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const IconSend = (p: P) => svg(p, <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>);
export const IconLock = (p: P) => svg(p, <><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const IconShield = (p: P) => svg(p, <><path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" /><path d="m9 11.5 2.2 2.2L15.5 9.4" /></>);
export const IconPlus = (p: P) => svg(p, <path d="M12 5v14M5 12h14" />);
export const IconChevronLeft = (p: P) => svg(p, <path d="m15 18-6-6 6-6" />);
export const IconChevronRight = (p: P) => svg(p, <path d="m9 18 6-6-6-6" />);
export const IconArrowLeft = (p: P) => svg(p, <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>);
export const IconDownload = (p: P) => svg(p, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);
export const IconPaperclip = (p: P) => svg(p, <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />);
export const IconCheck = (p: P) => svg(p, <path d="M20 6 9 17l-5-5" />);
export const IconX = (p: P) => svg(p, <path d="M18 6 6 18M6 6l12 12" />);
export const IconLogout = (p: P) => svg(p, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);
export const IconMenu = (p: P) => svg(p, <path d="M4 6h16M4 12h16M4 18h16" />);
export const IconBell = (p: P) => svg(p, <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>);
export const IconClock = (p: P) => svg(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconSparkle = (p: P) => svg(p, <path d="M12 3l1.9 5.4L19.5 10l-5.6 1.6L12 17l-1.9-5.4L4.5 10l5.6-1.6z" />);
export const IconFile = (p: P) => svg(p, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>);
export const IconSettings = (p: P) => svg(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>);
