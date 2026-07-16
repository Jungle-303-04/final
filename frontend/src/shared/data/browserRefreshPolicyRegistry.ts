export interface BrowserRefreshPolicy {
  staleAfterSeconds: number | null;
  refreshAfterSeconds: number;
  keepLastSuccess: true;
  pauseWhenHidden: true;
  eventInvalidation: boolean;
  retryAfterSeconds: number | null;
  retryLimit: number | null;
  postMutationRefreshAfterSeconds: number | null;
}

export interface BrowserRefreshPolicyRegistry<Key extends string = string> {
  getPolicy(key: Key, signal?: AbortSignal): Promise<BrowserRefreshPolicy>;
}

export function createBrowserRefreshPolicyRegistry<Key extends string, WirePolicy>(options: {
  load(signal?: AbortSignal): Promise<{
    revision: string;
    policies: Readonly<Record<Key, WirePolicy>>;
  }>;
  map(policy: WirePolicy): BrowserRefreshPolicy;
}): BrowserRefreshPolicyRegistry<Key> {
  let cached: ReadonlyMap<Key, BrowserRefreshPolicy> | null = null;
  let unboundRequest: Promise<ReadonlyMap<Key, BrowserRefreshPolicy>> | null = null;

  return {
    async getPolicy(key, signal) {
      signal?.throwIfAborted();
      const inventory = cached ?? await loadInventory(signal);
      signal?.throwIfAborted();
      const policy = inventory.get(key);
      if (policy === undefined) {
        throw new TypeError(`browser refresh policy inventory is missing ${key}`);
      }
      return policy;
    },
  };

  async function loadInventory(signal?: AbortSignal): Promise<ReadonlyMap<Key, BrowserRefreshPolicy>> {
    if (cached !== null) return cached;
    // An unbound bootstrap can be shared safely. A caller-bound request keeps
    // its own AbortSignal so one route never cancels another route's policy read.
    const request = signal === undefined
      ? unboundRequest ?? mapInventory(options.load())
      : mapInventory(options.load(signal));
    if (signal === undefined) unboundRequest = request;
    try {
      const inventory = await request;
      cached = inventory;
      return inventory;
    } finally {
      if (unboundRequest === request) unboundRequest = null;
    }
  }

  async function mapInventory(
    request: Promise<{ revision: string; policies: Readonly<Record<Key, WirePolicy>> }>,
  ): Promise<ReadonlyMap<Key, BrowserRefreshPolicy>> {
    const response = await request;
    const policies = new Map<Key, BrowserRefreshPolicy>();
    for (const key of Object.keys(response.policies) as Key[]) {
      policies.set(key, options.map(response.policies[key]));
    }
    return policies;
  }
}
