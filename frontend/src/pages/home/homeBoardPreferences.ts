import { useEffect, useRef, useState } from "react";

export const HOME_WIDGET_IDS = ["W2", "W3", "W4", "W5", "W6", "W7", "W8"] as const;
export type HomeWidgetId = typeof HOME_WIDGET_IDS[number];

export interface HomeBoardPreferences {
  collapsed: readonly HomeWidgetId[];
  order: readonly HomeWidgetId[];
  visible: readonly HomeWidgetId[];
}

export const DEFAULT_HOME_BOARD_PREFERENCES: HomeBoardPreferences = {
  collapsed: [],
  order: HOME_WIDGET_IDS,
  visible: HOME_WIDGET_IDS,
};

export function loadHomeBoardPreferences(
  storage: Pick<Storage, "getItem"> | null,
  key: string | null,
): HomeBoardPreferences {
  if (!storage || !key) return DEFAULT_HOME_BOARD_PREFERENCES;
  try {
    return normalizeHomeBoardPreferences(JSON.parse(storage.getItem(key) ?? "null"));
  } catch {
    return DEFAULT_HOME_BOARD_PREFERENCES;
  }
}

export function saveHomeBoardPreferences(
  storage: Pick<Storage, "setItem"> | null,
  key: string | null,
  preferences: HomeBoardPreferences,
) {
  if (!storage || !key) return;
  storage.setItem(key, JSON.stringify(normalizeHomeBoardPreferences(preferences)));
}

export function homeBoardPreferenceKey(
  workspaceId: string | null,
  userId: string | null,
): string | null {
  return workspaceId && userId
    ? `opsia:home-board:${workspaceId}:${userId}:v2`
    : null;
}

export function useHomeBoardPreferenceDraft(
  editing: boolean,
  key: string | null,
) {
  const storage = browserStorage();
  const [preferences, setPreferences] = useState<HomeBoardPreferences>(() =>
    loadHomeBoardPreferences(storage, key)
  );
  const [draft, setDraft] = useState(preferences);
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (!wasEditing.current && editing) setDraft(preferences);
    if (wasEditing.current && !editing) {
      setPreferences(draft);
      saveHomeBoardPreferences(storage, key, draft);
    }
    wasEditing.current = editing;
  }, [draft, editing, key, preferences, storage]);
  return {
    preferences: editing ? draft : preferences,
    update: editing ? setDraft : setPreferences,
  };
}

function normalizeHomeBoardPreferences(value: unknown): HomeBoardPreferences {
  if (!isRecord(value)) return DEFAULT_HOME_BOARD_PREFERENCES;
  const order = uniqueWidgetIds(value.order);
  const visible = uniqueWidgetIds(value.visible);
  const collapsed = uniqueWidgetIds(value.collapsed);
  return {
    order: [...order, ...HOME_WIDGET_IDS.filter((id) => !order.includes(id))],
    visible: visible.length > 0 ? visible : DEFAULT_HOME_BOARD_PREFERENCES.visible,
    collapsed: collapsed.filter((id) => visible.includes(id)),
  };
}

function uniqueWidgetIds(value: unknown): HomeWidgetId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isHomeWidgetId))];
}

function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return typeof value === "string" &&
    HOME_WIDGET_IDS.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
