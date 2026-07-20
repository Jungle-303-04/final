import { useEffect, useState } from "react";
import {
  ShellStatePortFailure,
  type ShellStatePort,
  type UiPreferencesRecord,
} from "../shell-state/shellStateContract";
import { useI18n } from "../../shared/i18n";
import { useProductTheme } from "../../shared/ui/useProductTheme";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

/** Hydrates and persists only validated, user-owned presentation preferences. */
export function UiPreferencesSync({ port }: { port: ShellStatePort }) {
  const theme = useProductTheme();
  const i18n = useI18n();
  const [record, setRecord] = useState<UiPreferencesRecord | null>(null);
  const currentKey = preferenceKey(theme.selection, i18n.locale);

  useEffect(() => {
    let active = true;
    const sharedRequest = acquireSharedRequest(
      port,
      "ui-preferences:initial",
      (signal) => port.getUiPreferences(signal),
    );
    void sharedRequest.promise.then((next) => {
      if (!active) return;
      setRecord(next);
    }, () => {
      if (active) setRecord(null);
    });
    return () => {
      active = false;
      sharedRequest.release();
    };
    // Browser-persisted preferences own first paint. An asynchronous server read
    // must never translate or resize an already visible shell.
  }, [port]);

  useEffect(() => {
    if (record === null) return;
    const serverKey = preferenceKey(
      record.preferences.theme,
      record.preferences.locale,
    );
    if (currentKey === serverKey) return;
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
        setRecord(next);
      }, (error: unknown) => {
        if (!active) return;
        if (error instanceof ShellStatePortFailure && error.code === "conflict") {
          void port.getUiPreferences(controller.signal).then((next) => {
            if (!active) return;
            setRecord(next);
          });
        }
      });
    }, 250);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [currentKey, i18n.locale, port, record, theme.selection]);

  return null;
}

function preferenceKey(theme: string, locale: string): string {
  return `${theme}:${locale}`;
}
