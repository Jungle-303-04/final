import { describe, expect, it } from "vitest";

import {
  translate,
  type SupportedLocale,
  type TranslationFunction,
} from "../../shared/i18n";
import { createHelmCopy } from "./helmCopy";

const DEAD_HELM_COPY_PROPERTIES = [
  "chartSourcesRegisterConflict",
  "upgrade",
  "upgradeTitle",
  "upgradeDescription",
  "upgradeTarget",
  "upgradeConfirm",
  "upgradePending",
  "upgradeFailed",
  "upgradeStale",
  "upgradeForbidden",
  "upgradeInputRequired",
  "upgradeStreamUnavailable",
  "valuesPreview",
  "valuesPreviewPending",
  "valuesPreviewRunning",
  "valuesPreviewFailed",
  "valuesPreviewStreamUnavailable",
  "valuesPreviewInvalid",
  "valuesPreviewReady",
  "artifactQueued",
] as const;

function copyFor(locale: SupportedLocale) {
  const t: TranslationFunction = (key, params) => translate(locale, key, params);
  return createHelmCopy(t);
}

describe("createHelmCopy", () => {
  it("exposes exactly the 210 product copy properties consumed by Helm screens", () => {
    const copy = copyFor("en");

    expect(Object.keys(copy)).toHaveLength(210);
    for (const property of DEAD_HELM_COPY_PROPERTIES) {
      expect(copy).not.toHaveProperty(property);
    }
  });

  it("renders English and Korean labels from the typed catalogs", () => {
    expect(copyFor("en").chartSources).toBe("Chart sources");
    expect(copyFor("ko").chartSources).toBe("차트 소스");
    expect(copyFor("ko").refresh).toBe("새로 고침");
  });

  it("preserves interpolation and optional rollback diff lines in both locales", () => {
    const en = copyFor("en");
    const ko = copyFor("ko");

    expect(en.chartCatalogInstall("stable/nginx")).toBe("Install stable/nginx");
    expect(ko.chartCatalogInstall("stable/nginx")).toBe("stable/nginx 설치");
    expect(en.operationDiff("cluster-a", "target", "api", 8, null)).toBe(
      "Cluster: cluster-a\nNamespace: target\nRelease: api\nObserved revision: 8",
    );
    expect(ko.operationDiff("cluster-a", "target", "api", 8, 5)).toBe(
      "클러스터: cluster-a\n네임스페이스: target\n릴리스: api\n관측된 리비전: 8\n롤백 리비전: 5",
    );
  });
});
