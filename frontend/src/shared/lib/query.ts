import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: (n, err: unknown) => n < 1 && (err as { kind?: string }).kind === 'network' } },
});
