import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Card } from '@/ui';
import { fadeInUp, listItem, listStagger } from '@/ui/motion';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-primary">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <motion.section
          variants={listStagger}
          initial="initial"
          animate="animate"
          className="hidden max-w-xl gap-6 lg:grid"
          aria-label="제품 소개"
        >
          <motion.div variants={listItem} className="inline-flex items-center gap-3">
            <BrandMark />
            <div className="min-w-0">
              <p className="text-title font-semibold text-primary">KubeHeal Console</p>
              <p className="text-label text-muted">Kubernetes 운영 자동화</p>
            </div>
          </motion.div>
          <motion.div variants={listItem} className="grid gap-3">
            <h2 className="text-page font-semibold text-primary">인시던트 탐지부터 복구 조치까지 한 화면에서 관리</h2>
            <p className="max-w-lg text-body leading-6 text-secondary">
              클러스터 상태, 증거 트레일, 워크플로 실행을 같은 토큰과 같은 밀도로 정리해 운영자가 빠르게 판단하도록 돕습니다.
            </p>
          </motion.div>
          <motion.dl variants={listItem} className="grid gap-3 text-body">
            {[
              ['상태 어휘', '정상 · 주의 · 심각 · 대기 · 실행 중 · 실패'],
              ['운영 흐름', '탐지 · 증거 수집 · 복구 조치 · 승인'],
              ['보안 기준', '세션 기반 접근 · 관리자 승인 · 감사 로그'],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 border-l border-border pl-4">
                <dt className="text-label font-semibold text-muted">{label}</dt>
                <dd className="text-secondary">{value}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.section>

        <motion.section variants={fadeInUp} initial="initial" animate="animate" className="flex min-w-0 items-center justify-center">
          <Card className="w-full max-w-md p-6 sm:p-8">
            <div className="mb-6 grid gap-4">
              <div className="flex items-center gap-3 lg:hidden">
                <BrandMark />
                <span className="text-title font-semibold text-primary">KubeHeal Console</span>
              </div>
              <div className="grid gap-1">
                <h1 className="text-page font-semibold text-primary">{title}</h1>
                {subtitle && <p className="text-body text-secondary">{subtitle}</p>}
              </div>
            </div>
            {children}
          </Card>
        </motion.section>
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-panel bg-accent text-title font-semibold text-on-accent shadow-soft">
      K
    </span>
  );
}
