import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import '@/shared/tokens.css';
import '@/shared/ui/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": prefers-reduced-motion 사용자는 전환 즉시 완료 (I12) */}
    <MotionConfig reducedMotion="user">
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </MotionConfig>
  </StrictMode>,
);
