// 공용 SVG 아이콘 — 이모지 금지(플랫폼별 렌더 편차·톤 불일치). currentColor 로 테마 토큰을 따른다.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, ...rest,
  };
}

export const IconCheckCircle = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>
);

export const IconAlertTriangle = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3.8 2.9 19.2a1 1 0 0 0 .9 1.5h16.4a1 1 0 0 0 .9-1.5L12 3.8Z" /><path d="M12 9.5v4.5" /><path d="M12 17.2v.1" /></svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.8" /></svg>
);

export const IconBell = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 9a6 6 0 1 0-12 0c0 6-2.4 7-2.4 7h16.8S18 15 18 9Z" /><path d="M10.2 20a2 2 0 0 0 3.6 0" /></svg>
);

export const IconFlame = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3.5s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.6-3 1.4-4.2.4 1 1.1 1.7 1.9 2 .1-2.3.5-4.3 1.2-5.8Z" /></svg>
);

export const IconFile = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 3Z" /><path d="M14 3v4.5h4.5" /></svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}><path d="m9.5 6 6 6-6 6" /></svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /><path d="M12 15v2" /></svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h16" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M6.5 7 7.3 19.5A1.6 1.6 0 0 0 8.9 21h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
);

export const IconSend = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 3 10.5 13.5" /><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z" /></svg>
);
