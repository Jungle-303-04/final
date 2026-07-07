import type { QueryClient } from '@tanstack/react-query';
import { refreshSession, sessionKey } from '@/features/auth/api';
import type { Session } from '@/shared/lib/types';

export const SESSION_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

type RefreshOptions = {
  refresh?: () => Promise<Session>;
  now?: () => number;
  throttleMs?: number;
};

export function createSessionRefreshController(
  queryClient: QueryClient,
  options: RefreshOptions = {},
) {
  const refresh = options.refresh ?? refreshSession;
  const now = options.now ?? Date.now;
  const throttleMs = options.throttleMs ?? SESSION_REFRESH_THROTTLE_MS;
  let lastRefreshAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  const refreshAfterInteraction = () => {
    const session = queryClient.getQueryData<Session>(sessionKey);
    if (!session?.authenticated || inFlight) {
      return;
    }

    const currentTime = now();
    if (lastRefreshAt !== null && currentTime - lastRefreshAt < throttleMs) {
      return;
    }

    lastRefreshAt = currentTime;
    inFlight = refresh()
      .then(nextSession => {
        queryClient.setQueryData(sessionKey, nextSession);
      })
      .catch((): void => {
        // 갱신 실패 시 기존 캐시를 유지한다. 401 처리는 전역 핸들러가 세션 쿼리를 무효화한다.
      })
      .finally(() => {
        inFlight = null;
      });
  };

  return { refreshAfterInteraction };
}

export function installSessionRefresh(queryClient: QueryClient) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const controller = createSessionRefreshController(queryClient);
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };

  events.forEach(eventName => {
    window.addEventListener(eventName, controller.refreshAfterInteraction, listenerOptions);
  });

  return () => {
    events.forEach(eventName => {
      window.removeEventListener(eventName, controller.refreshAfterInteraction, listenerOptions);
    });
  };
}
