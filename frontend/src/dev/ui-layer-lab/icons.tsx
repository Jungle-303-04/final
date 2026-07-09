import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function CommandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.2 4.5A2.2 2.2 0 1 0 4 6.7h2.2V4.5ZM6.2 13.3H4a2.2 2.2 0 1 0 2.2 2.2v-2.2ZM13.8 6.7H16a2.2 2.2 0 1 0-2.2-2.2v2.2ZM13.8 13.3v2.2a2.2 2.2 0 1 0 2.2-2.2h-2.2ZM6.2 6.7h7.6v6.6H6.2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </IconBase>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 2.7l1.3 4.5 4.2 1.4-4.2 1.5-1.3 4.4-1.3-4.4-4.2-1.5 4.2-1.4L10 2.7ZM15.3 12.7l.6 1.8 1.6.6-1.6.6-.6 1.6-.6-1.6-1.7-.6 1.7-.6.6-1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </IconBase>
  );
}

export function PanelIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.3 4.2h13.4v11.6H3.3V4.2Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11.5 4.2v11.6M5.8 7h3M5.8 10h2M13.3 7h1.5M13.3 10h1.5M13.3 13h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </IconBase>
  );
}

export function JobsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 5.2h12M4 10h12M4 14.8h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 5.2h4.6M4 10h8.2M4 14.8h10.3" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </IconBase>
  );
}

export function FlowIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 4.5h4v4H5zM11 11.5h4v4h-4z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 6.5h2.5A2.5 2.5 0 0 1 14 9v2.5M7 8.5v2A2.5 2.5 0 0 0 9.5 13H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </IconBase>
  );
}

export function TerminalBoxIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.5 4.5h13v11h-13z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 8l2 2-2 2M9.5 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12.8 12.8l3.2 3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </IconBase>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 4.8v10.4l8-5.2-8-5.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.5 10.3l3.2 3.2 7.8-8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5v4l2.7 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </IconBase>
  );
}

export function WarnIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 3.5l7 12H3l7-12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 7.5v3.8M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </IconBase>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="10" r="4" fill="currentColor" />
    </IconBase>
  );
}
