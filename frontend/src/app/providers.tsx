import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { queryClient } from '@/shared/lib/query';
import { setUnauthorizedHandler } from '@/shared/lib/api';
import { clearSessionHint, sessionKey } from '@/features/auth/api';
import { installSessionRefresh } from '@/features/auth/sessionRefresh';
import { ToastProvider, ToastViewport } from '@/ui';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionHint();
      queryClient.invalidateQueries({ queryKey: sessionKey });
    });
    return installSessionRefresh(queryClient);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  );
}
