export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      className={`brand-mark ${className}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mark-sky" x1="12" y1="4" x2="56" y2="60">
          <stop offset="0%" stopColor="var(--navy)" />
          <stop offset="100%" stopColor="var(--navy-2)" />
        </linearGradient>
        <linearGradient id="mark-page" x1="18" y1="16" x2="50" y2="52">
          <stop offset="0%" stopColor="var(--foam)" />
          <stop offset="100%" stopColor="var(--paper)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mark-sky)" />
      <path
        d="M6 44c8-7 16-7 24 0s16 7 28 0"
        fill="none"
        stroke="var(--copper)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M18 18h10c6 0 8 3 14 3h4v26h-6c-6 0-8-3-14-3H18V18Z"
        fill="url(#mark-page)"
      />
      <path
        d="M32 21v26"
        fill="none"
        stroke="var(--navy)"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <path
        d="M21 28h8M21 34h8M21 40h7M35 28h8M35 34h8"
        fill="none"
        stroke="var(--navy)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="48" cy="16" r="5" fill="var(--copper)" />
    </svg>
  );
}

export function HarbourScene({ className = "h-full w-full" }: { className?: string }) {
  return (
    <svg
      className={`harbour-scene ${className}`}
      viewBox="0 0 420 320"
      role="img"
      aria-label="Harbour ledger artwork: an open job book over a Sydney harbour line"
    >
      <defs>
        <linearGradient id="scene-water" x1="0" y1="160" x2="0" y2="320">
          <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--navy)" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="scene-page" x1="80" y1="40" x2="340" y2="250">
          <stop offset="0%" stopColor="var(--foam)" />
          <stop offset="100%" stopColor="var(--paper)" />
        </linearGradient>
      </defs>
      <rect width="420" height="320" rx="28" fill="var(--foam)" />
      <rect width="420" height="320" rx="28" fill="var(--navy)" opacity="0.16" />
      <circle cx="332" cy="72" r="38" fill="var(--copper)" opacity="0.9" />
      <path
        d="M0 214c42-28 84-28 126 0s84 28 126 0 84-28 126 0 42 14 42 14v92H0V214Z"
        fill="url(#scene-water)"
      />
      <path
        d="M0 214c42-28 84-28 126 0s84 28 126 0 84-28 126 0 42 14 42 14"
        fill="none"
        stroke="var(--copper)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="translate(86 48)">
        <path
          d="M18 12h92c28 0 38 18 72 18h18v178h-28c-28 0-38-18-72-18H18V12Z"
          fill="url(#scene-page)"
          stroke="var(--line)"
          strokeWidth="2"
        />
        <path d="M128 18v176" stroke="var(--navy)" strokeWidth="2" opacity="0.45" />
        <path
          d="M38 48h62M38 68h54M38 88h58M38 108h48M148 52h62M148 72h58M148 92h50"
          stroke="var(--navy)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.35"
        />
        <rect x="38" y="138" width="70" height="28" rx="8" fill="var(--navy)" opacity="0.85" />
        <rect x="148" y="138" width="54" height="12" rx="4" fill="var(--copper)" opacity="0.7" />
      </g>
    </svg>
  );
}
