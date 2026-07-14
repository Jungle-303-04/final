import type { ReactNode } from "react";
import type { TranslationFunction } from "../../shared/i18n/types";

export function FormField({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  error?: string;
}) {
  return (
    <div className={`grid min-w-0 gap-1.5 ${className || ""}`}>
      <label className="contents">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {children}
      </label>
      {error ? <span className="text-xs font-medium text-destructive" role="alert">{error}</span> : null}
    </div>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
  ariaLabel,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={`h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 ${className || ""}`}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

export function environmentLabel(environment: string, t: TranslationFunction): string {
  if (environment === "development") return t("workflows.option.environment.development");
  if (environment === "production") return t("workflows.option.environment.production");
  return t("workflows.option.environment.staging");
}

export function strategyLabel(strategy: string, t: TranslationFunction): string {
  if (strategy === "canary") return t("workflows.option.strategy.canary");
  if (strategy === "blue_green") return t("workflows.option.strategy.blueGreen");
  return t("workflows.option.strategy.rolling");
}

export function policyLabel(policy: string, t: TranslationFunction): string {
  if (policy === "production_only") return t("workflows.option.policy.productionOnly");
  if (policy === "auto_safe") return t("workflows.option.policy.autoSafe");
  if (policy === "external_change_ticket") return t("workflows.option.policy.changeTicket");
  return t("workflows.option.policy.manualEach");
}

export function gateLabel(gate: string, t: TranslationFunction): string {
  if (gate === "auto") return t("workflows.option.gate.auto");
  if (gate === "manual") return t("workflows.option.gate.manual");
  if (gate === "safe_pr") return t("workflows.option.gate.safePr");
  return t("workflows.option.gate.inherit");
}
