export type HelmChartSourceProvider = "repository" | "oci";
export type HelmChartSourceStatus = "active" | "disabled";

export interface HelmChartSource {
  id: string;
  provider: HelmChartSourceProvider;
  name: string;
  reference: string;
  status: HelmChartSourceStatus;
  credentialsConfigured: boolean;
  observedAt: string | null;
}

export interface HelmChartSourcePage {
  items: readonly HelmChartSource[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface HelmChartSourceListRequest {
  limit?: number;
  cursor?: string;
}

export type HelmChartSourceCredential =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string };

export interface HelmChartSourceRegisterRequest {
  provider: HelmChartSourceProvider;
  name: string;
  reference: string;
  credential?: HelmChartSourceCredential;
}
