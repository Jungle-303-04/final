import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { Toaster } from '@/components/ui/sonner';
import '@/ui/theme.css';

const deployedSourceSha = import.meta.env.VITE_SOURCE_SHA;
if (/^[0-9a-f]{40}$/.test(deployedSourceSha ?? '')) {
  document.documentElement.dataset.sourceSha = deployedSourceSha;
}

// 테마는 첫 페인트 전에 적용 — 로그인 등 셸 밖 화면도 같은 다크/라이트 팔레트를 쓴다
const initialThemeMode = localStorage.getItem('theme-mode') === 'light' ? 'light' : 'dark';
document.documentElement.setAttribute('data-theme-mode', initialThemeMode);
document.documentElement.classList.toggle('dark', initialThemeMode === 'dark');
document.documentElement.classList.toggle('light', initialThemeMode === 'light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": prefers-reduced-motion 사용자는 전환 즉시 완료 (I12) */}
    <MotionConfig reducedMotion="user">
      <Providers>
        <RouterProvider router={router} />
        <Toaster />
      </Providers>
    </MotionConfig>
  </StrictMode>,
);
