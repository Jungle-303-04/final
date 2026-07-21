import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applicationsGitOpsCopy } from "../shared/i18n/applicationsGitOpsCopy";
import { alertsEn } from "../shared/i18n/catalogs/en/alerts";
import { clustersEn } from "../shared/i18n/catalogs/en/clusters";
import { resourcesEn } from "../shared/i18n/catalogs/en/resources";
import { shellEn } from "../shared/i18n/catalogs/en/shell";
import { alertsKo } from "../shared/i18n/catalogs/ko/alerts";
import { clustersKo } from "../shared/i18n/catalogs/ko/clusters";
import { shellKo } from "../shared/i18n/catalogs/ko/shell";
import { en } from "../shared/i18n/en";
import { ko } from "../shared/i18n/ko";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Kyro brand surface", () => {
  it("uses the Kyro product name across localized visible copy", () => {
    const visibleCopy = [
      ko["product.name"],
      ko["auth.login.title"],
      ko["shell.dock.askAi"],
      en["product.name"],
      en["auth.login.title"],
      en["shell.dock.askAi"],
      shellKo["shell.ai.title"],
      shellEn["shell.ai.title"],
      clustersKo["clusters.connect.description"],
      clustersEn["clusters.connect.description"],
      alertsKo["alerts.source.opsia"],
      alertsEn["alerts.source.opsia"],
      resourcesEn["resources.manifest.description"],
      applicationsGitOpsCopy("ko").failures.offline,
      applicationsGitOpsCopy("en").failures.offline,
    ];

    for (const value of visibleCopy) {
      expect(value).toContain("Kyro");
      expect(value).not.toContain("Opsia");
    }
  });

  it("keeps legacy protocol and storage identifiers out of the visible brand audit", async () => {
    const files = [
      "index.html",
      "src/devpreview-ai.tsx",
      "src/devpreview-connect.tsx",
      "src/devpreview-surfaces.tsx",
      "src/devpreview-unified.tsx",
      "src/main.tsx",
    ];
    const source = (
      await Promise.all(files.map((file) => readFile(resolve(frontendRoot, file), "utf8")))
    ).join("\n");

    for (const retiredVisibleLabel of [
      "<title>Opsia</title>",
      "Opsia AI",
      "Opsia Console",
      ">Opsia</span>",
      "opsia-agent ·",
      "opsia-agent 실행 중",
      "Opsia root container",
    ]) {
      expect(source).not.toContain(retiredVisibleLabel);
    }
  });

  it("self-hosts Geist and applies one typography contract to active product surfaces", async () => {
    const [
      tokens,
      foundation,
      unified,
      map,
      topology,
      connect,
      surfaces,
      widgets,
      notice,
      fontLicense,
    ] =
      await Promise.all([
        readFile(resolve(frontendRoot, "src/styles/tokens.css"), "utf8"),
        readFile(resolve(frontendRoot, "src/styles/foundation.css"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview-unified.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview-opsia.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview-topology.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview-connect.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview-surfaces.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "src/devpreview/widgets.tsx"), "utf8"),
        readFile(resolve(frontendRoot, "../NOTICE"), "utf8"),
        readFile(resolve(frontendRoot, "public/licenses/geist-OFL-1.1.txt"), "utf8"),
      ]);

    expect(tokens).toContain('@import "@fontsource-variable/geist"');
    expect(tokens).toContain('--font-sans: "Geist Variable"');
    expect(tokens).toContain("--font-weight-body: 500");
    expect(tokens).toContain("--font-weight-numeric: 650");
    expect(tokens).toContain("--font-weight-title: 700");
    expect(foundation).toContain("font-variant-numeric: tabular-nums");

    for (const activeSurface of [unified, map, topology, connect]) {
      expect(activeSurface).toContain("font-family: var(--font-sans)");
      expect(activeSurface).not.toContain("font-family: -apple-system");
    }

    for (const activeSurface of [unified, map, topology, connect, surfaces, widgets]) {
      expect(activeSurface).not.toContain("fontWeight: 800");
    }

    expect(notice).toContain("frontend/public/licenses/geist-OFL-1.1.txt");
    expect(fontLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});
