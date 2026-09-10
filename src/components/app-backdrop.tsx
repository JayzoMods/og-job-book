export function AppBackdrop() {
  return (
    <div className="app-backdrop print:hidden" aria-hidden="true">
      <svg className="app-harbour" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ogjb-bg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.28" />
            <stop offset="55%" stopColor="var(--navy)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--paper)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ogjb-bg-sun" cx="78%" cy="16%" r="32%">
            <stop offset="0%" stopColor="var(--copper)" stopOpacity="0.7" />
            <stop offset="45%" stopColor="var(--copper)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--copper)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ogjb-bg-page" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--foam)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--paper)" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#ogjb-bg-sky)" />
        <circle className="app-sun" cx="1140" cy="150" r="240" fill="url(#ogjb-bg-sun)" />
        <circle className="app-sun-core" cx="1140" cy="150" r="38" fill="var(--copper)" />
        <g className="app-stars">
          <circle cx="180" cy="90" r="1.6" />
          <circle cx="260" cy="150" r="1.2" />
          <circle cx="340" cy="70" r="1.4" />
          <circle cx="480" cy="120" r="1.1" />
          <circle cx="620" cy="58" r="1.5" />
          <circle cx="740" cy="110" r="1.2" />
          <circle cx="860" cy="46" r="1.3" />
          <circle cx="980" cy="96" r="1.1" />
          <circle cx="1280" cy="64" r="1.4" />
          <circle cx="1360" cy="140" r="1.2" />
        </g>
        <g className="app-water">
          <path
            className="app-tide app-tide-a"
            d="M-80 620 C140 590 340 650 560 622 C800 590 1040 655 1280 628 C1380 618 1460 635 1520 626"
            fill="none"
          />
          <path
            className="app-tide app-tide-b"
            d="M-60 690 C160 662 380 718 620 692 C860 664 1100 724 1340 698 C1420 690 1480 702 1540 694"
            fill="none"
          />
          <path
            className="app-tide app-tide-c"
            d="M-40 760 C180 736 400 788 640 764 C900 736 1140 798 1380 772"
            fill="none"
          />
        </g>
        <g className="app-ledger" transform="translate(1040 520) rotate(-6)">
          <path
            d="M0 12h92c22 0 32 14 62 14h16v150h-24c-22 0-32-14-62-14H0V12Z"
            fill="url(#ogjb-bg-page)"
            stroke="var(--line)"
            strokeWidth="1.5"
          />
          <path d="M92 16v140" stroke="var(--navy)" strokeWidth="1.4" opacity="0.35" />
          <path
            d="M18 42h52M18 58h46M18 74h50M18 90h40M112 46h48M112 62h44M112 78h38"
            stroke="var(--navy)"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.28"
          />
          <rect x="18" y="118" width="52" height="16" rx="6" fill="var(--navy)" opacity="0.45" />
          <rect x="112" y="118" width="40" height="8" rx="3" fill="var(--copper)" opacity="0.55" />
        </g>
      </svg>
      <div className="app-mist" />
      <div className="app-noise" />
    </div>
  );
}
