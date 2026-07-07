// plural-ui 아이콘 세트 — 레퍼런스 룩앤필에 맞춘 자체 제작 SVG
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  xmlns: 'http://www.w3.org/2000/svg',
});

/** 더미 로고 마크 — 원형 + 사각형 조합의 제네릭 심볼 */
export function PluralMarkIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

/** 사이드바: 클러스터(프레임) */
export function FrameIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="4" y="4" width="8" height="8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 1.5v2M12 1.5v2M4 12.5v2M12 12.5v2M1.5 4h2M1.5 12h2M12.5 4h2M12.5 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 사이드바: 리스트 */
export function ListIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="2.5" cy="4" r="1" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" />
      <path d="M5.5 4h9M5.5 8h9M5.5 12h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 사이드바: 터미널(클라우드 셸) */
export function TerminalIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m4.5 6 2.5 2-2.5 2M8.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CaretRightIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3Z" fill="currentColor" />
    </svg>
  );
}

/** 종이비행기(전송) */
export function SendIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M2.5 8 13.5 2.8 10.6 13.2 7.8 9.4 2.5 8ZM7.8 9.4l5.7-6.6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function ChartIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M2 13.5h12M4 13V8M8 13V4M12 13V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function GlobeIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 8h12M8 2c1.8 1.7 2.6 3.8 2.6 6S9.8 12.3 8 14c-1.8-1.7-2.6-3.8-2.6-6S6.2 3.7 8 2Z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function ShieldIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 1.8 13.5 4v4c0 3.2-2.2 5.4-5.5 6.5C4.7 13.4 2.5 11.2 2.5 8V4L8 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m5.8 8 1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocumentIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 1.5h5.5L12.5 5v9.5H4V1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.5 1.5V5H13M6 8h4.5M6 10.5h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function PackageIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2 5l6 3 6-3M8 8v6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
