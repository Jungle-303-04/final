import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { queryClient } from '@/shared/lib/query';
import { setUnauthorizedHandler } from '@/shared/lib/api';
import { sessionKey } from '@/features/auth/api';
import { installSessionRefresh } from '@/features/auth/sessionRefresh';
import { Toasts } from '@/shared/ui';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    setUnauthorizedHandler(() => queryClient.invalidateQueries({ queryKey: sessionKey }));
    return installSessionRefresh(queryClient);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toasts />
    </QueryClientProvider>
  );
}
