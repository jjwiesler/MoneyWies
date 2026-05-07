const PATHS = {
  dashboard:  <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  ledger:     <><path d="M4 4h14a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-4-3V4z"/><path d="M8 9h8M8 13h6"/></>,
  reports:    <><path d="M3 20h18"/><rect x="5" y="11" width="3" height="8"/><rect x="10.5" y="7" width="3" height="12"/><rect x="16" y="3" width="3" height="16"/></>,
  rules:      <><path d="M4 6h10M4 12h16M4 18h10"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="18" r="2"/></>,
  accounts:   <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  import:     <><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></>,
  settings:   <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  search:     <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  plus:       <><path d="M12 5v14M5 12h14"/></>,
  arrowUp:    <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  arrowDown:  <><path d="M12 5v14M19 12l-7 7-7-7"/></>,
  arrowRight: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
  chev:       <><path d="m9 6 6 6-6 6"/></>,
  chevDown:   <><path d="m6 9 6 6 6-6"/></>,
  chevUp:     <><path d="m18 15-6-6-6 6"/></>,
  eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff:     <><path d="M3 3l18 18"/><path d="M10.5 5.2a11 11 0 0 1 1.5-.2c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.2M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
  filter:     <><path d="M3 5h18M6 12h12M10 19h4"/></>,
  calendar:   <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  sparkle:    <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>,
  x:          <><path d="M18 6 6 18M6 6l12 12"/></>,
  check:      <><path d="M20 6 9 17l-5-5"/></>,
  home:       <><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H14v-6h-4v6H4a1 1 0 0 1-1-1V10.5z"/></>,
  edit:       <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  trash:      <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  split:      <><path d="M16 3h5v5M8 3H3v5M3 21l7-7 4 4 7-7"/></>,
  chat:       <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  send:       <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  repeat:     <><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
};

export default function Icon({ name, size = 16, stroke = 1.75 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
