const RELOAD_ATTEMPT_TTL_MS = 5 * 60 * 1000;
const RELOAD_MARKER_PREFIX = "product:chunk-preload-reload";

interface ChunkLoadRecoveryOptions {
  sourceSha?: string;
  eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  storage?: Pick<Storage, "getItem" | "setItem">;
  reload?: () => void;
  now?: () => number;
}

/**
 * Recovers a browser that still runs an older entry bundle after a rolling
 * deployment removed one of that bundle's hashed lazy chunks.
 */
export function installChunkLoadRecovery({
  sourceSha = "unknown",
  eventTarget = window,
  storage = window.sessionStorage,
  reload = () => window.location.reload(),
  now = Date.now,
}: ChunkLoadRecoveryOptions = {}): () => void {
  const markerKey = `${RELOAD_MARKER_PREFIX}:${sourceSha}`;
  let memoryAttemptAt: number | null = null;

  const handlePreloadError = (event: Event) => {
    const currentTime = now();
    const storedAttemptAt = readAttemptAt(storage, markerKey);
    const previousAttemptAt = storedAttemptAt ?? memoryAttemptAt;

    if (
      previousAttemptAt !== null
      && currentTime - previousAttemptAt >= 0
      && currentTime - previousAttemptAt < RELOAD_ATTEMPT_TTL_MS
    ) {
      return;
    }

    memoryAttemptAt = currentTime;
    writeAttemptAt(storage, markerKey, currentTime);
    event.preventDefault();
    reload();
  };

  eventTarget.addEventListener("vite:preloadError", handlePreloadError);
  return () => eventTarget.removeEventListener("vite:preloadError", handlePreloadError);
}

function readAttemptAt(
  storage: Pick<Storage, "getItem">,
  markerKey: string,
): number | null {
  try {
    const value = storage.getItem(markerKey);
    if (value === null) return null;
    const attemptAt = Number(value);
    return Number.isFinite(attemptAt) ? attemptAt : null;
  } catch {
    return null;
  }
}

function writeAttemptAt(
  storage: Pick<Storage, "setItem">,
  markerKey: string,
  attemptAt: number,
): void {
  try {
    storage.setItem(markerKey, String(attemptAt));
  } catch {
    // The in-memory marker still prevents a reload loop when storage is blocked.
  }
}

