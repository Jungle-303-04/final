import { ArrowUpCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "../../shared/i18n";
import { Badge, badgeVariants } from "../../shared/ui/primitives/badge";
import {
  EMPTY_RUNTIME_STATUS_PORT,
  type RuntimeStatusPort,
  type VersionCheck,
} from "./runtimeStatusContract";

const versionChecks = new WeakMap<RuntimeStatusPort, Promise<VersionCheck>>();

export function VersionUpdateNotice({
  port = EMPTY_RUNTIME_STATUS_PORT,
}: {
  port?: RuntimeStatusPort;
}) {
  const { t } = useI18n();
  const [version, setVersion] = useState<VersionCheck | null>(null);

  useEffect(() => {
    let active = true;
    void checkVersionOnce(port).then(
      (value) => {
        if (active) setVersion(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [port]);

  if (
    version?.availability === "unavailable" ||
    version?.updateAvailable !== true ||
    version.latestVersion === null
  ) return null;

  const label = t("shell.version.updateAvailable", { version: version.latestVersion });
  const content = (
    <>
      <ArrowUpCircle aria-hidden="true" />
      <span className="hidden max-w-40 truncate sm:inline">{label}</span>
    </>
  );
  const releaseUrl = safeHttpUrl(version.releaseUrl);
  return releaseUrl === null ? (
    <Badge aria-label={label} title={version.releaseNotes ?? undefined} variant="warning">
      {content}
    </Badge>
  ) : (
    <a
      aria-label={label}
      className={badgeVariants({ variant: "warning" })}
      href={releaseUrl}
      rel="noreferrer"
      target="_blank"
      title={version.releaseNotes ?? undefined}
    >
      {content}
    </a>
  );
}

function checkVersionOnce(port: RuntimeStatusPort): Promise<VersionCheck> {
  const existing = versionChecks.get(port);
  if (existing !== undefined) return existing;
  const request = port.checkVersion();
  versionChecks.set(port, request);
  return request;
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value, typeof window === "undefined" ? "https://localhost" : window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
