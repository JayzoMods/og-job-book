export function AppBackdrop() {
  return (
    <div className="app-backdrop print:hidden" aria-hidden="true">
      <svg className="app-harbour" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ogjb-bg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.42" />
            <stop offset="48%" stopColor="var(--navy)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--paper)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ogjb-bg-sun" cx="78%" cy="18%" r="28%">
            <stop offset="0%" stopColor="var(--copper)" stopOpacity="0.95" />
            <stop offset="38%" stopColor="var(--copper)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--copper)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ogjb-bg-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--navy)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="ogjb-bg-page" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--foam)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--paper)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#ogjb-bg-sky)" />
        <circle className="app-sun" cx="1120" cy="168" r="210" fill="url(#ogjb-bg-sun)" />
        <circle className="app-sun-core" cx="1120" cy="168" r="46" fill="var(--copper)" />
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
        <path
          className="app-headland"
          d="M-40 430 C120 390 220 450 360 420 C520 380 620 455 780 430 C920 408 1040 470 1180 445 C1280 428 1380 455 1480 430 L1480 900 L-40 900 Z"
        />
        <g className="app-water">
          <path
            d="M-40 520 C180 490 360 545 560 518 C780 488 980 545 1220 520 C1340 508 1420 528 1480 518 L1480 900 L-40 900 Z"
            fill="url(#ogjb-bg-water)"
          />
          <path
            className="app-tide app-tide-a"
            d="M-80 590 C140 560 340 620 560 592 C800 560 1040 625 1280 598 C1380 588 1460 605 1520 596"
            fill="none"
          />
          <path
            className="app-tide app-tide-b"
            d="M-60 650 C160 622 380 678 620 652 C860 624 1100 684 1340 658 C1420 650 1480 662 1540 654"
            fill="none"
          />
          <path
            className="app-tide app-tide-c"
            d="M-40 710 C180 686 400 738 640 714 C900 686 1140 748 1380 722"
            fill="none"
          />
        </g>
        <g className="app-ledger" transform="translate(980 470) rotate(-8)">
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
        <g className="app-glint">
          <path d="M1118 214 L1122 214 L1132 520 L1108 520 Z" />
          <path d="M1040 250 L1043 250 L1054 500 L1028 500 Z" />
        </g>
      </svg>
      <div className="app-mist" />
      <div className="app-noise" />
    </div>
  );
}
