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

/** 사이드바: 사람들 */
export function PeopleIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="6" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 13c.5-2.3 2.2-3.5 4.2-3.5s3.7 1.2 4.2 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10.5 3.6a2.2 2.2 0 0 1 0 3.9M12.1 9.7c1.1.5 1.9 1.6 2.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 사이드바: 카드(빌링) */
export function CardIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6.2h13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 10.2h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

export function DiscordIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path
        d="M12.9 3.6A11 11 0 0 0 10.2 2.8l-.13.26a9.2 9.2 0 0 0-2.14 0L7.8 2.8a11 11 0 0 0-2.7.85C3.4 6.2 3 8.7 3.2 11.1c1 .74 2 1.2 3 1.5l.62-.86a6.5 6.5 0 0 1-1-.48l.24-.18a7.8 7.8 0 0 0 3.9.94 7.8 7.8 0 0 0 3.9-.94l.24.18c-.32.19-.66.35-1 .48l.62.86c1-.3 2-.76 3-1.5.25-2.8-.43-5.2-1.82-7.5ZM6.7 9.6c-.6 0-1.1-.55-1.1-1.22s.48-1.22 1.1-1.22 1.11.55 1.1 1.22c0 .67-.48 1.22-1.1 1.22Zm4.06 0c-.6 0-1.1-.55-1.1-1.22s.49-1.22 1.1-1.22c.62 0 1.12.55 1.1 1.22 0 .67-.48 1.22-1.1 1.22Z"
        fill="currentColor"
        transform="translate(-1.5 1) scale(1.15)"
      />
    </svg>
  );
}

export function GitHubIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path
        d="M8 1.3a6.7 6.7 0 0 0-2.12 13.06c.34.06.46-.15.46-.33v-1.14c-1.87.4-2.26-.9-2.26-.9-.3-.78-.75-.99-.75-.99-.6-.41.05-.4.05-.4.67.04 1.03.69 1.03.69.6 1.02 1.56.73 1.94.56.06-.43.23-.73.42-.9-1.49-.17-3.05-.74-3.05-3.31 0-.73.26-1.33.69-1.8-.07-.17-.3-.85.06-1.78 0 0 .56-.18 1.84.69a6.4 6.4 0 0 1 3.36 0c1.28-.87 1.84-.69 1.84-.69.36.93.13 1.61.07 1.78.43.47.68 1.07.68 1.8 0 2.58-1.57 3.14-3.06 3.3.24.21.45.62.45 1.24v1.85c0 .18.12.4.47.33A6.7 6.7 0 0 0 8 1.3Z"
        fill="currentColor"
      />
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

export function ArrowRightIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

export function CaretDownIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

export function PlusIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 3.5v-1h-8v8h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

export function TrashIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M2.5 4h11M6.5 2h3M4 4l.7 9.3a1 1 0 0 0 1 .7h4.6a1 1 0 0 0 1-.7L12 4M6.5 6.8v4.4M9.5 6.8v4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EditIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M11.3 2.4a1.6 1.6 0 0 1 2.3 2.3L5.4 12.9l-3 .7.7-3 8.2-8.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 2.5v7.5M4.8 7.2 8 10.4l3.2-3.2M2.5 13h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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

export function WarningIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 2 1.6 13.4h12.8L8 2Z" fill="#FFCF33" />
      <path d="M8 6.2v3.4" stroke="#0E1015" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r=".8" fill="#0E1015" />
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

/** AWS 글리프 (단순화 재현) */
export function AwsIcon({ size = 24, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <text x="12" y="12" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontSize="8.5" fontWeight="700" fill="currentColor">
        aws
      </text>
      <path d="M5 15.5c4.3 3 9.7 3 14 0M17.2 15.9l1.9-.5-.4 1.9" stroke="#E09600" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** GCP 글리프 (단순화 재현) */
export function GcpIcon({ size = 24, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M12 5.5 6 16h12L12 5.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Azure 글리프 (단순화 재현) */
export function AzureIcon({ size = 24, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M10.5 5 5 17h4l1.5-3.5L14 17h5L10.5 5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
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

export function KeyIcon({ size = 16, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="5" cy="11" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.2 8.8 13.5 2.5M11 5l2 2M9 7l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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
