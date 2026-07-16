import { useEffect, useRef, useState } from "react";
import {
  ShellStatePortFailure,
  type ShellStatePort,
  type UiPreferencesRecord,
} from "../shell-state/shellStateContract";
import { useI18n } from "../../shared/i18n";
import { useProductTheme } from "../../shared/ui/useProductTheme";

/** Hydrates and persists only validated, user-owned presentation preferences. */
export function UiPreferencesSync({ port }: { port: ShellStatePort }) {
  const theme = useProductTheme();
  const i18n = useI18n();
  const [record, setRecord] = useState<UiPreferencesRecord | null>(null);
  const applyingKey = useRef<string | null>(null);
  const currentKey = preferenceKey(theme.selection, i18n.locale);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void port.getUiPreferences(controller.signal).then((next) => {
      if (!active) return;
      if (next.revision === 0) {
        applyingKey.current = null;
        setRecord(next);
        return;
      }
      applyingKey.current = preferenceKey(
        next.preferences.theme,
        next.preferences.locale,
      );
      setRecord(next);
      theme.select(next.preferences.theme);
      i18n.setLocale(next.preferences.locale);
    }, () => {
      if (active) setRecord(null);
    });
    return () => {
      active = false;
      controller.abort();
    };
    // Controllers are stable enough for the authenticated runtime lifetime;
    // loading again on a theme change would overwrite the user's new choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  useEffect(() => {
    if (record === null) return;
    const serverKey = preferenceKey(
      record.preferences.theme,
      record.preferences.locale,
    );
    if (currentKey === serverKey) return;
    if (currentKey === applyingKey.current) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      void port.updateUiPreferences({
        preferences: {
          theme: theme.selection,
          locale: i18n.locale,
        },
        expectedRevision: record.revision,
      }, controller.signal).then((next) => {
        if (!active) return;
        applyingKey.current = currentKey;
        setRecord(next);
      }, (error: unknown) => {
        if (!active) return;
        if (error instanceof ShellStatePortFailure && error.code === "conflict") {
          void port.getUiPreferences(controller.signal).then((next) => {
            if (!active) return;
            applyingKey.current = preferenceKey(
              next.preferences.theme,
              next.preferences.locale,
            );
            setRecord(next);
            theme.select(next.preferences.theme);
            i18n.setLocale(next.preferences.locale);
          });
        }
      });
    }, 250);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [currentKey, i18n, port, record, theme]);

  return null;
}

function preferenceKey(theme: string, locale: string): string {
  return `${theme}:${locale}`;
}
