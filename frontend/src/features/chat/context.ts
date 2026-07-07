export interface AiChatContext {
  cluster_id?: string;
  resource_type?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  uid?: string;
  locale?: string;
}

const KIND_BY_RESOURCE_TYPE: Record<string, string> = {
  cluster: 'Cluster',
  node: 'Node',
  pod: 'Pod',
  service: 'Service',
};

export function compactContext(raw: AiChatContext): AiChatContext | undefined {
  const entries = Object.entries(raw)
    .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''] as const)
    .filter(([, value]) => value.length > 0);
  if (!entries.length) return undefined;
  const context = Object.fromEntries(entries) as AiChatContext;
  if (context.resource_type && !context.kind) {
    context.kind = KIND_BY_RESOURCE_TYPE[context.resource_type] ?? undefined;
  }
  return context;
}

export function encodeChatContext(raw: AiChatContext): string | undefined {
  const context = compactContext(raw);
  return context ? JSON.stringify(context) : undefined;
}

export function chatContextFromSearchParams(params: URLSearchParams): AiChatContext | undefined {
  const encoded = params.get('context');
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as Record<string, unknown>;
      return compactContext({
        cluster_id: stringValue(parsed.cluster_id),
        resource_type: stringValue(parsed.resource_type),
        kind: stringValue(parsed.kind),
        namespace: stringValue(parsed.namespace),
        name: stringValue(parsed.name),
        uid: stringValue(parsed.uid),
        locale: stringValue(parsed.locale),
      });
    } catch {
      return undefined;
    }
  }
  return compactContext({
    cluster_id: params.get('cluster_id') ?? params.get('cluster') ?? undefined,
    resource_type: params.get('resource_type') ?? params.get('subject') ?? undefined,
    kind: params.get('kind') ?? undefined,
    namespace: params.get('namespace') ?? undefined,
    name: params.get('name') ?? undefined,
    uid: params.get('uid') ?? undefined,
    locale: params.get('locale') ?? undefined,
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
