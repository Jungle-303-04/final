import type { ReactNode } from 'react';
import { FadeSlideIn } from '@/shared/motion';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(800px 400px at 50% 0%, var(--surface-2), var(--surface-0))' }}>
      <FadeSlideIn>
        <div className="card" style={{ width: 'min(440px, 92vw)', padding: 'var(--sp-8)' }}>
          <div style={{ fontSize: 'var(--fs-2xl)', marginBottom: 4 }}>◈</div>
          <h1 style={{ fontSize: 'var(--fs-xl)', margin: '0 0 4px' }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)', marginTop: 0 }}>{subtitle}</p>}
          {children}
        </div>
      </FadeSlideIn>
    </div>
  );
}
