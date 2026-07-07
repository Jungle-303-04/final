import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: shouldRetryQuery } },
});

const REQUEST_TIMEOUT_DETAIL = '요청 시간이 초과되었습니다';

function shouldRetryQuery(n: number, err: unknown) {
  const e = err as { kind?: string; detail?: string };
  // timeout 은 사용자가 즉시 재시도 여부를 판단해야 한다. 자동 재시도로 스켈레톤이 반복되면 장애처럼 보인다.
  return n < 1 && e.kind === 'network' && e.detail !== REQUEST_TIMEOUT_DETAIL;
}
