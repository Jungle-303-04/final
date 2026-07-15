import type {
  AlertRuleComparator,
  AlertRuleMetric,
  AlertRuleScope,
  AlertRuleSeverity,
} from "./alertRulesContract";

export interface AlertRuleEndpointValue {
  rule_id: string;
  name: string;
  scope: AlertRuleScope;
  metric: AlertRuleMetric;
  comparator: AlertRuleComparator;
  threshold: number;
  for_seconds: number;
  severity: AlertRuleSeverity;
  channels: string[];
  enabled: boolean;
  last_fired_at: string | null;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleEndpointInput {
  name: string;
  scope: AlertRuleScope;
  metric: AlertRuleMetric;
  comparator: AlertRuleComparator;
  threshold: number;
  for_seconds: number;
  severity: AlertRuleSeverity;
  channels: string[];
  enabled: boolean;
}

export interface AlertRuleEndpoints {
  listAlertRules(signal?: AbortSignal): Promise<{ rules: AlertRuleEndpointValue[] }>;
  createAlertRule(input: AlertRuleEndpointInput, signal?: AbortSignal): Promise<{ rule_id: string }>;
  updateAlertRule(
    ruleId: string,
    input: Partial<AlertRuleEndpointInput>,
    signal?: AbortSignal,
  ): Promise<AlertRuleEndpointValue>;
  deleteAlertRule(ruleId: string, signal?: AbortSignal): Promise<void>;
}
