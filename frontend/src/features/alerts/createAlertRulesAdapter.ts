import type { AlertRule, AlertRuleInput, AlertRulesPort } from "./alertRulesContract";
import type {
  AlertRuleEndpointInput,
  AlertRuleEndpoints,
  AlertRuleEndpointValue,
} from "./alertRulesEndpointContract";

export function createAlertRulesAdapter(endpoints: AlertRuleEndpoints): AlertRulesPort {
  return {
    async list(signal) {
      const response = await endpoints.listAlertRules(signal);
      return response.rules.map(toRule);
    },
    async create(input, signal) {
      const response = await endpoints.createAlertRule(toInput(input), signal);
      return { ruleId: response.rule_id };
    },
    async update(ruleId, input, signal) {
      return toRule(await endpoints.updateAlertRule(ruleId, toPatch(input), signal));
    },
    remove(ruleId, signal) {
      return endpoints.deleteAlertRule(ruleId, signal);
    },
  };
}

function toRule(value: AlertRuleEndpointValue): AlertRule {
  return {
    id: value.rule_id,
    name: value.name,
    scope: value.scope,
    metric: value.metric,
    comparator: value.comparator,
    threshold: value.threshold,
    forSeconds: value.for_seconds,
    severity: value.severity,
    channels: value.channels,
    enabled: value.enabled,
    lastFiredAt: value.last_fired_at,
    occurrenceCount: value.occurrence_count,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function toInput(value: AlertRuleInput): AlertRuleEndpointInput {
  return {
    name: value.name,
    scope: value.scope,
    metric: value.metric,
    comparator: value.comparator,
    threshold: value.threshold,
    for_seconds: value.forSeconds,
    severity: value.severity,
    channels: value.channels,
    enabled: value.enabled,
  };
}

function toPatch(value: Partial<AlertRuleInput>): Partial<AlertRuleEndpointInput> {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.scope === undefined ? {} : { scope: value.scope }),
    ...(value.metric === undefined ? {} : { metric: value.metric }),
    ...(value.comparator === undefined ? {} : { comparator: value.comparator }),
    ...(value.threshold === undefined ? {} : { threshold: value.threshold }),
    ...(value.forSeconds === undefined ? {} : { for_seconds: value.forSeconds }),
    ...(value.severity === undefined ? {} : { severity: value.severity }),
    ...(value.channels === undefined ? {} : { channels: value.channels }),
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
  };
}
