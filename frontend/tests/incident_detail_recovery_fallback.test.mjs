import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

const FALLBACK_TITLE = '\uC778\uC2DC\uB358\uD2B8 \uD0C0\uC784\uB77C\uC778 \uC0C1\uC138\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4';
const RECOVERY_PLAN_HEADING = '\uBCF5\uAD6C \uACC4\uD68D';

let vite;
let originalConsoleError;

before(async () => {
  originalConsoleError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    originalConsoleError(...args);
  };
  vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true },
  });
});

after(async () => {
  console.error = originalConsoleError;
  await vite?.close();
});

test('incident not_found fallback still renders the recovery plan for the correlation id', async () => {
  const { default: IncidentDetailView } = await vite.ssrLoadModule('/src/features/notifications/IncidentDetailView.tsx');
  const correlationId = 'corr-fallback-recovery-plan';
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnMount: false,
        retry: false,
        retryOnMount: false,
      },
    },
  });

  await setIncidentNotFound(queryClient, correlationId);
  queryClient.setQueryData(['recovery-plan', correlationId], recoveryPlan(correlationId));
  queryClient.setQueryData(['rca-reports', correlationId], []);
  queryClient.setQueryData(['evidence', correlationId, 'all'], { items: [], has_more: false, limit: 100, offset: 0 });

  const html = renderToString(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [`/incidents/${correlationId}`] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/incidents/:incidentId', element: React.createElement(IncidentDetailView) }),
        ),
      ),
    ),
  );

  assert.ok(html.includes(FALLBACK_TITLE), 'expected the incident-detail 404 fallback shell');
  assert.ok(html.includes(RECOVERY_PLAN_HEADING), 'expected the recovery plan panel in fallback mode');
  assert.ok(html.includes('Restart payment deployment'), 'expected recovery plan candidates to render');
  assert.ok(html.includes('manual_approval'), 'expected the recovery plan route to render');
});

test('incident evidence empty state distinguishes collecting from none', async () => {
  const { isEvidenceCollecting } = await vite.ssrLoadModule('/src/features/notifications/IncidentDetailView.tsx');
  const baseIncident = {
    incident_id: 'incident-1',
    correlation_id: 'corr-1',
    cluster_id: 'cluster-1',
    status: 'running',
    current_subject: 'evidence.collect',
    summary: 'checkout latency',
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: [],
    action_route: null,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: '2026-07-08T00:00:00Z',
  };

  assert.equal(isEvidenceCollecting({ ...baseIncident, missing_evidence: ['logs'] }), true);
  assert.equal(isEvidenceCollecting({ ...baseIncident, status: 'completed', missing_evidence: ['logs'] }), false);
  assert.equal(isEvidenceCollecting({ ...baseIncident, current_subject: 'analysis', supporting_evidence: ['kubernetes'] }), false);
});

async function setIncidentNotFound(queryClient, correlationId) {
  const error = Object.assign(new Error('Incident not found'), {
    detail: 'Incident not found',
    kind: 'not_found',
    status: 404,
  });
  await queryClient.prefetchQuery({
    queryKey: ['incident', correlationId],
    queryFn: async () => {
      throw error;
    },
    retry: false,
  });
}

function recoveryPlan(correlationId) {
  return {
    plan_id: 'plan-fallback-1',
    correlation_id: correlationId,
    incident_id: 'incident-from-plan',
    evidence_ref: 'evidence-fallback-1',
    status: 'selection_requested',
    summary: 'Restart deployment safely after configuration recovery.',
    target: { namespace: 'payments', workload: 'payment-gateway' },
    recommended_action_id: 'restart-deployment',
    execution_route: 'manual_approval',
    selection_required: true,
    selected_action_id: null,
    selected_by: null,
    selected_action: null,
    candidates: [
      {
        action_id: 'restart-deployment',
        title: 'Restart payment deployment',
        description: 'Roll the deployment so pods pick up the corrected environment.',
        route: 'kubectl',
        rank: 1,
        score: 0.91,
        risk_level: 'medium',
        blast_radius: 'namespace',
        approval_required: true,
        prerequisites: [],
        validation_checks: [],
        rollback_plan: 'Undo the rollout if readiness fails.',
        evidence_refs: [],
      },
    ],
  };
}
