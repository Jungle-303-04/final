import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ko } from "./ko";
import {
  PRODUCT_LOCALE_STORAGE_KEY,
  detectNavigatorLocale,
  persistLocale,
  readPersistedLocale,
  resolveInitialLocale,
} from "./locale";
import {
  formatDateForLocale,
  formatNumberForLocale,
  translate,
} from "./runtime";
import type { MessageKey } from "./types";

describe("i18n catalogs", () => {
  it("keeps English and Korean catalogs exhaustive over the same literal keys", () => {
    const englishKeys = Object.keys(en).sort();
    const koreanKeys = Object.keys(ko).sort();

    expect(englishKeys.length).toBeGreaterThan(40);
    expect(koreanKeys).toEqual(englishKeys);
    expect(en["shell.nav.home"]).toBe("Home");
    expect(ko["shell.nav.home"]).toBe("홈");
    for (const key of englishKeys) {
      expect(placeholders(en[key as MessageKey])).toEqual(
        placeholders(ko[key as MessageKey]),
      );
    }
  });

  it("accepts only a MessageKey as the translation lookup key", () => {
    const key: MessageKey = "common.action.retry";
    expect(translate("en", key)).toBe("Retry");
  });

  it("localizes the Helm upgrade empty selection", () => {
    expect(translate("en", "helm.upgrade.selectValue")).toBe("Select a value");
    expect(translate("ko", "helm.upgrade.selectValue")).toBe("값 선택");
  });
});

describe("locale resolution", () => {
  it("defaults to Korean and honors supported explicit navigator languages", () => {
    expect(detectNavigatorLocale(undefined)).toBe("ko");
    expect(detectNavigatorLocale("en-US")).toBe("en");
    expect(detectNavigatorLocale("fr-FR")).toBe("ko");
    expect(detectNavigatorLocale("ko")).toBe("ko");
    expect(detectNavigatorLocale("ko-KR")).toBe("ko");
    expect(detectNavigatorLocale("KO_kr")).toBe("ko");
  });

  it("keeps six metric preset name and description pairs localized", () => {
    const metricPresetKeys = Object.keys(en).filter((key) => key.startsWith("metrics.preset."));

    expect(metricPresetKeys).toHaveLength(12);
    expect(metricPresetKeys).toEqual(
      Object.keys(ko).filter((key) => key.startsWith("metrics.preset.")),
    );
    expect(translate("en", "metrics.preset.nodeCpuUsage.name")).toBe("Node CPU usage");
    expect(translate("ko", "metrics.preset.nodeCpuUsage.name")).toBe("Node CPU 사용률");
  });

  it("gives a supported persisted explicit locale priority over navigator", () => {
    const storage = memoryStorage({ [PRODUCT_LOCALE_STORAGE_KEY]: "en" });
    expect(resolveInitialLocale({ storage, navigatorLanguage: "ko-KR" })).toBe("en");

    storage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "ko");
    expect(resolveInitialLocale({ storage, navigatorLanguage: "en-US" })).toBe("ko");
  });

  it("ignores invalid or inaccessible persisted values", () => {
    expect(readPersistedLocale(memoryStorage({ [PRODUCT_LOCALE_STORAGE_KEY]: "fr" }))).toBeNull();
    const inaccessible = {
      getItem: () => { throw new DOMException("blocked"); },
      setItem: () => { throw new DOMException("blocked"); },
    };
    expect(readPersistedLocale(inaccessible)).toBeNull();
    expect(resolveInitialLocale({ storage: inaccessible, navigatorLanguage: "ko" })).toBe("ko");
  });

  it("persists only supported explicit user choices without throwing", () => {
    const storage = memoryStorage();
    persistLocale("ko", storage);
    expect(storage.getItem(PRODUCT_LOCALE_STORAGE_KEY)).toBe("ko");

    expect(() => persistLocale("en", {
      getItem: () => null,
      setItem: () => { throw new DOMException("blocked"); },
    })).not.toThrow();
  });
});

describe("translation and Intl formatting", () => {
  it("interpolates named presentation parameters without treating raw values as keys", () => {
    expect(translate("en", "resources.list.count", { returned: 18, limit: 200 }))
      .toBe("18 shown · limit 200");
    expect(translate("ko", "resources.list.count", { returned: 18, limit: 200 }))
      .toBe("18 표시 · 최대 200");
    expect(translate("en", "common.value.named", { name: "<pod-a>" }))
      .toBe("<pod-a>");
  });

  it("leaves a missing named placeholder visible instead of inserting undefined", () => {
    expect(translate("en", "resources.list.count", { returned: 3 }))
      .toBe("3 shown · limit {limit}");
  });

  it("uses the selected locale for number and date formatting", () => {
    const instant = new Date("2026-07-13T00:00:00.000Z");
    const dateOptions = { dateStyle: "medium" } as const;
    const numberOptions = { maximumFractionDigits: 1 } as const;

    expect(formatNumberForLocale("ko", 1234.5, numberOptions)).toBe(
      new Intl.NumberFormat("ko-KR", numberOptions).format(1234.5),
    );
    expect(formatNumberForLocale("en", 1234.5, numberOptions)).toBe(
      new Intl.NumberFormat("en-US", numberOptions).format(1234.5),
    );
    expect(formatDateForLocale("ko", instant, dateOptions)).toBe(
      new Intl.DateTimeFormat("ko-KR", dateOptions).format(instant),
    );
  });
});

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function placeholders(message: string): string[] {
  return Array.from(message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu), ([, name]) => name)
    .sort();
}
