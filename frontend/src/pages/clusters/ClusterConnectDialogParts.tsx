import { Check, Clipboard, LoaderCircle, TriangleAlert } from "lucide-react";
import type { I18nController } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import type { ConnectPhase } from "./ClusterConnectDialog";

export function ConnectionModeButton({
  description,
  onClick,
  title,
}: {
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="grid min-h-36 content-center gap-2 rounded-xl border bg-card p-5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
      onClick={onClick}
      type="button"
    >
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

export function ConnectionCommandStep({
  copyState,
  expiresAt,
  formatDate,
  installCommand,
  onCopy,
  phase,
  t,
}: {
  copyState: "idle" | "copied" | "failed";
  expiresAt: string | null;
  formatDate: I18nController["formatDate"];
  installCommand: string | null;
  onCopy: () => void;
  phase: ConnectPhase;
  t: I18nController["t"];
}) {
  if (phase === "failed" || phase === "expired") {
    const expired = phase === "expired";
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{t(expired ? "clusters.connect.expired.title" : "clusters.connect.failure.title")}</AlertTitle>
        <AlertDescription>
          {t(expired ? "clusters.connect.expired.description" : "clusters.connect.failure.description")}
        </AlertDescription>
      </Alert>
    );
  }
  if (!installCommand) return null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-semibold">{t("clusters.connect.command.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("clusters.connect.command.description")}</p>
      </div>
      <pre className="max-h-48 overflow-auto rounded-xl border bg-muted p-4 text-xs"><code>{installCommand}</code></pre>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t("clusters.connect.waiting")}
        </span>
        <Button onClick={onCopy} variant="outline">
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}
        </Button>
      </div>
      {copyState === "failed" ? (
        <p className="text-sm text-destructive">{t("clusters.connect.copyFailure")}</p>
      ) : null}
      {expiresAt ? (
        <p className="text-xs text-muted-foreground">
          {t("clusters.connect.expires", { time: formatDate(new Date(expiresAt)) })}
        </p>
      ) : null}
    </div>
  );
}
