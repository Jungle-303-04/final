// mock API 라우터 — (method, 경로 패턴) → 핸들러. 실제 계약(docs/fd/06)과 동일 경로 유지
import * as fx from '@/shared/lib/mock/fixtures';
import { ApiError } from '@/shared/lib/api';
import type { ChatMessage, Session } from '@/shared/lib/types';

// mock 세션은 localStorage 지속 — 새로고침/딥링크에서도 로그인 유지(데모 목적)
const SESSION_KEY = 'mock:session';
function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}
const state = {
  session: loadSession(),
  conversations: structuredClone(fx.conversations),
  users: structuredClone(fx.users),
  orgs: structuredClone(fx.orgs),
  groups: structuredClone(fx.groups),
  grants: structuredClone(fx.grants),
  runsByApp: structuredClone(fx.runsByApp),
  deadLetters: structuredClone(fx.deadLetters),
};

const delay = (ms = 180) => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);

type Handler = (params: Record<string, string>, body: any, query: URLSearchParams) => unknown;
const routes: [string, string, Handler][] = [
  ['GET', '/auth/session', () => state.session ?? { authenticated: false }],
  ['POST', '/auth/login', (_p, b) => {
    if (b.email === 'teammate@example.com') throw new ApiError(403, 'account approval required');
    if (b.password?.length < 8) throw new ApiError(401, 'invalid credentials');
    state.session = { authenticated: true, user_id: 'u-1', email: b.email, workspace_id: 'default', roles: b.email.startsWith('admin') ? ['service_admin'] : ['user'] };
    localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    return state.session;
  }],
  ['POST', '/auth/logout', () => { state.session = null; localStorage.removeItem(SESSION_KEY); return { accepted: true }; }],
  ['POST', '/auth/signup', () => ({ accepted: true, verification_required: true })],
  ['POST', '/auth/resend-verification', () => ({ accepted: true, verification_required: true })],
  ['POST', '/auth/users/:userId/approve', (p) => {
    const u = state.users.find(u => u.user_id === p.userId);
    if (!u) throw new ApiError(404, 'user not found');
    u.status = 'active';
    return { accepted: true, user_id: u.user_id, status: 'active', role: u.role };
  }],

  ['GET', '/clusters', () => ({ clusters: fx.clusters })],
  ['GET', '/clusters/:id', (p) => ({ cluster: fx.clusters.find(c => c.cluster_id === p.id) ?? err404() })],
  ['GET', '/clusters/:id/connection-status', (p) => ({ cluster_id: p.id, connection_status: 'connected' })],
  ['GET', '/clusters/:id/inventory/summary', (p) => fx.summaryOf(p.id)],
  ['GET', '/clusters/:id/inventory/workloads', (p) => ({ workloads: fx.workloadsByCluster[p.id] ?? [] })],
  ['GET', '/clusters/:id/inventory/resources', (_p, _b, q) => ({ resources: fx.resources.filter(r => !q.get('kind') || r.kind === q.get('kind')) })],
  ['GET', '/clusters/:id/inventory/services', () => ({ services: fx.services })],
  ['GET', '/clusters/:id/inventory/events', () => ({ events: fx.events })],
  ['POST', '/clusters/:id/namespaces/:ns/deployments/:name/scale', () => ({ accepted: true })],
  ['POST', '/clusters/:id/namespaces/:ns/deployments/:name/restart', () => ({ accepted: true })],
  ['PUT', '/clusters/:id/policy', () => ({ accepted: true })],
  ['POST', '/targets', () => ({ registered: true, applied: false, agent_token: `agt_${uid()}${uid()}`, install_manifest: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: target\n# … (mock manifest)' })],
  ['GET', '/providers/catalog', () => ({ providers: { cloud: [ { key: 'existing-k8s', label: '기존 Kubernetes', status: 'available' } ], deploy: [ { key: 'manual-manifest', label: '수동 manifest 적용', status: 'available' } ], source: [ { key: 'github', label: 'GitHub', status: 'available' } ], secret: [ { key: 'env', label: '환경 변수', status: 'available' } ] } })],
  ['POST', '/providers/validate', () => ({ valid: true, errors: [], warnings: [] })],

  ['GET', '/applications', () => ({ applications: fx.applications })],
  ['POST', '/applications', (_p, b) => ({ application_id: `app-${uid()}`, ...b })],
  ['GET', '/applications/:id', (p) => fx.applications.find(a => a.application_id === p.id) ?? err404()],
  ['GET', '/applications/:id/deployments', (p) => ({ deployments: fx.deploymentsByApp[p.id] ?? [] })],
  ['GET', '/applications/:id/runs', (p) => ({ runs: state.runsByApp[p.id] ?? [] })],
  ['GET', '/catalog/items', () => ({ items: fx.catalogItems })],
  ['POST', '/catalog/items/:id/installs', () => ({ accepted: true })],
  ['POST', '/approvals/:id/grant', (p) => resolveApproval(p.id, 'granted')],
  ['POST', '/approvals/:id/reject', (p) => resolveApproval(p.id, 'rejected')],

  ['GET', '/ai/conversations', () => ({ conversations: state.conversations.map(({ messages: _m, ...rest }) => rest) })],
  ['POST', '/ai/conversations', (_p, b) => {
    const conv = { conversation_id: `conv-${uid()}`, title: String(b.message).slice(0, 30), status: 'waiting' as const, updated_at: fx.nowIso(), messages: [mkMsg('user', b.message)] };
    state.conversations.unshift(conv);
    scheduleAssistant(conv.conversation_id);
    return { accepted: true, conversation_id: conv.conversation_id };
  }],
  ['GET', '/ai/conversations/:id', (p) => state.conversations.find(c => c.conversation_id === p.id) ?? err404()],
  ['POST', '/ai/conversations/:id/messages', (p, b) => {
    const conv = state.conversations.find(c => c.conversation_id === p.id) ?? err404();
    conv.messages.push(mkMsg('user', b.message)); conv.status = 'waiting'; conv.updated_at = fx.nowIso();
    scheduleAssistant(conv.conversation_id);
    return { accepted: true };
  }],
  ['POST', '/rca/recovery-plans/:planId/actions/:actionId/select', (p) => {
    state.conversations.forEach(c => c.messages.forEach(m => { if (m.actions?.plan_id === p.planId) m.actions.selected = p.actionId; }));
    return { accepted: true };
  }],

  ['GET', '/dashboard/rca/timeline', () => ({ items: fx.incidents })],
  ['GET', '/dashboard/rca/incidents/:id', (p) => ({ item: fx.incidents.find(i => i.incident_id === p.id) ?? err404() })],
  ['GET', '/dead-letters', () => ({ dead_letters: state.deadLetters })],
  ['POST', '/dead-letters/:id/replay', (p) => {
    const d = state.deadLetters.find(d => String(d.id) === p.id) ?? err404();
    d.status = 'replayed';
    return { accepted: true, dead_letter_id: d.id };
  }],
  ['POST', '/agent/debug/query', () => ({ accepted: true, command_id: `cmd-${uid()}`, correlation_id: uid() })],

  // 갭 API (G1~G5, G10) — docs/fd/06 계약 초안 구현
  ['GET', '/orgs', () => ({ orgs: state.orgs })],
  ['POST', '/orgs', (_p, b) => { const o = { org_id: `org-${uid()}`, description: '', member_count: 0, group_count: 0, created_at: fx.nowIso(), ...b }; state.orgs.push(o); return o; }],
  ['DELETE', '/orgs/:id', (p) => {
    if (state.groups.some(g => g.org_id === p.id)) throw new ApiError(422, 'groups_exist');
    state.orgs = state.orgs.filter(o => o.org_id !== p.id); return undefined;
  }],
  ['GET', '/groups', () => ({ groups: state.groups })],
  ['POST', '/groups', (_p, b) => { const g = { group_id: `grp-${uid()}`, member_count: 0, ...b }; state.groups.push(g); const o = state.orgs.find(o => o.org_id === b.org_id); if (o) o.group_count += 1; return g; }],
  ['GET', '/groups/:id/members', (p) => ({ members: state.users.filter(u => u.groups.includes(p.id)).map(u => ({ user_id: u.user_id, email: u.email })) })],
  ['PUT', '/groups/:id/members/:userId', (p) => { const u = state.users.find(u => u.user_id === p.userId) ?? err404(); if (!u.groups.includes(p.id)) u.groups.push(p.id); return { accepted: true }; }],
  ['DELETE', '/groups/:id/members/:userId', (p) => { const u = state.users.find(u => u.user_id === p.userId) ?? err404(); u.groups = u.groups.filter(g => g !== p.id); return undefined; }],
  ['GET', '/users', (_p, _b, q) => ({ users: state.users.filter(u => !q.get('status') || u.status === q.get('status')) })],
  ['GET', '/access', (_p, _b, q) => ({ grants: state.grants.filter(g => !q.get('resource_id') || g.resource_id === q.get('resource_id')) })],
  ['POST', '/access', (_p, b) => { const g = { access_id: `acc-${uid()}`, granted_at: fx.nowIso(), subject_label: b.subject_label ?? b.subject_id, ...b }; state.grants.push(g); return g; }],
  ['DELETE', '/access/:id', (p) => { state.grants = state.grants.filter(g => g.access_id !== p.id); return undefined; }],
];

function err404(): never { throw new ApiError(404, 'not found'); }
function mkMsg(role: 'user' | 'assistant', content: string): ChatMessage {
  return { message_id: `m-${uid()}`, role, content, created_at: fx.nowIso() };
}
function scheduleAssistant(convId: string) {
  setTimeout(() => {
    const conv = state.conversations.find(c => c.conversation_id === convId);
    if (!conv) return;
    conv.messages.push({ ...mkMsg('assistant', '확인했습니다. 관련 증거를 수집한 뒤 필요한 경우 복구 액션을 제안하겠습니다.'), tool_calls: [{ name: 'evidence.collect', args: 'cluster=target', status: 'ok' }] });
    conv.status = 'idle'; conv.updated_at = fx.nowIso();
  }, 2500);
}
function resolveApproval(id: string, result: 'granted' | 'rejected') {
  Object.values(state.runsByApp).flat().forEach(run => {
    if (run.approval_id === id && run.status === 'WAITING_FOR_APPROVAL') {
      run.status = result === 'granted' ? 'APPLYING' : 'FAILED';
      run.current_step = run.status;
      run.steps = run.steps.map(s => s.name === 'WAITING_FOR_APPROVAL' ? { ...s, status: result === 'granted' ? 'SUCCEEDED' : 'FAILED' } : s.name === 'APPLYING' && result === 'granted' ? { ...s, status: 'APPLYING' } : s);
    }
  });
  state.conversations.forEach(c => c.messages.forEach(m => { if (m.approval_ref?.approval_id === id) m.approval_ref.resolved = result; }));
  return { accepted: true, event_id: uid(), correlation_id: uid() };
}

export async function mockRequest<T>(method: string, pathWithQuery: string, body?: unknown): Promise<T> {
  await delay();
  const [path, queryStr] = pathWithQuery.split('?');
  const query = new URLSearchParams(queryStr ?? '');
  const segs = path.split('/').filter(Boolean);
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const pSegs = pattern.split('/').filter(Boolean);
    if (pSegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    pSegs.forEach((ps, i) => { if (ps.startsWith(':')) params[ps.slice(1)] = decodeURIComponent(segs[i]); else if (ps !== segs[i]) ok = false; });
    if (!ok) continue;
    const result = handler(params, body, query);
    // GET 은 state 참조 그대로 주면 React Query 가 변경 미감지 → 깊은 복사(실백엔드 직렬화와 동형)
    return (method === 'GET' && result && typeof result === 'object' ? structuredClone(result) : result) as T;
  }
  throw new ApiError(404, `mock 경로 없음: ${method} ${path}`);
}
