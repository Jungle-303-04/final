export type AlertRuleMetric = "cpu_pct" | "mem_pct" | "restart_count" | "pod_not_ready";
export type AlertRuleComparator = ">" | ">=" | "<" | "<=";
export type AlertRuleSeverity = "critical" | "high" | "medium" | "low";

export interface AlertRuleScope {
  clusters: string[];
  namespaces: string[];
  applications: string[];
  labels: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  scope: AlertRuleScope;
  metric: AlertRuleMetric;
  comparator: AlertRuleComparator;
  threshold: number;
  forSeconds: number;
  severity: AlertRuleSeverity;
  channels: string[];
  enabled: boolean;
  lastFiredAt: string | null;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRuleInput {
  name: string;
  scope: AlertRuleScope;
  metric: AlertRuleMetric;
  comparator: AlertRuleComparator;
  threshold: number;
  forSeconds: number;
  severity: AlertRuleSeverity;
  channels: string[];
  enabled: boolean;
}

export interface AlertRulesPort {
  list(signal?: AbortSignal): Promise<AlertRule[]>;
  create(input: AlertRuleInput, signal?: AbortSignal): Promise<{ ruleId: string }>;
  update(ruleId: string, input: Partial<AlertRuleInput>, signal?: AbortSignal): Promise<AlertRule>;
  remove(ruleId: string, signal?: AbortSignal): Promise<void>;
}

export const EMPTY_ALERT_RULES_PORT: AlertRulesPort = {
  async list() { return []; },
  async create() { throw new Error("Alert rule creation is unavailable"); },
  async update() { throw new Error("Alert rule updates are unavailable"); },
  async remove() { throw new Error("Alert rule deletion is unavailable"); },
};
