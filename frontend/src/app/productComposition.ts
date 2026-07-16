import {
  PRODUCT_ROUTE_CATALOG,
  type ProductSurfaceId,
} from "./productRoutes";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import {
  EMPTY_GLOBAL_FILTER_PORT,
  type GlobalFilterPort,
} from "../features/global-filter/globalFilterContract";
import {
  EMPTY_AI_ASSISTANT_PORT,
  type AiAssistantPort,
} from "../features/ai-assistant/aiAssistantContract";
import {
  EMPTY_LOG_STREAM_PORT,
  type LogStreamPort,
} from "../features/log-stream/logStreamContract";
import {
  EMPTY_ALERT_EVENTS_PORT,
  type AlertEventsPort,
} from "../features/alerts/alertEventsContract";
import {
  EMPTY_WORKLOAD_DETAIL_PORT,
  type WorkloadDetailPort,
} from "../features/workload-detail/workloadDetailContract";
import {
  EMPTY_COMPARE_PORT,
  type ComparePort,
} from "../features/compare/compareContract";
import {
  EMPTY_DIAGNOSE_PORT,
  type DiagnosePort,
} from "../features/diagnose/diagnoseContract";
import {
  createOperationStatusStore,
  type OperationStatusStore,
} from "../features/operations/OperationStatusStore";
import { EMPTY_OPERATION_EVENTS_PORT } from "../features/operations/operationEventsContract";
import type { ProductSurfaceLoader } from "./surfaceLoader";

export interface ProductSurfaceRegistration {
  id: ProductSurfaceId;
  loader: ProductSurfaceLoader;
}

export interface ProductComposition {
  auth: AuthPort;
  clusterScope: ClusterScopePort;
  globalFilter: GlobalFilterPort;
  aiAssistant: AiAssistantPort;
  logStream: LogStreamPort;
  alertEvents: AlertEventsPort;
  workloadDetail: WorkloadDetailPort;
  compare: ComparePort;
  diagnose: DiagnosePort;
  operationStatusStore: OperationStatusStore;
  surfaces: readonly ProductSurfaceRegistration[];
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
  dispose(): void;
}

export function createProductComposition(
  registrations: readonly ProductSurfaceRegistration[],
  auth: AuthPort,
  clusterScope: ClusterScopePort,
  globalFilter: GlobalFilterPort = EMPTY_GLOBAL_FILTER_PORT,
  aiAssistant: AiAssistantPort = EMPTY_AI_ASSISTANT_PORT,
  logStream: LogStreamPort = EMPTY_LOG_STREAM_PORT,
  alertEvents: AlertEventsPort = EMPTY_ALERT_EVENTS_PORT,
  operationStatusStore: OperationStatusStore = createOperationStatusStore(EMPTY_OPERATION_EVENTS_PORT),
  dispose: () => void = () => undefined,
  workloadDetail: WorkloadDetailPort = EMPTY_WORKLOAD_DETAIL_PORT,
  compare: ComparePort = EMPTY_COMPARE_PORT,
  diagnose: DiagnosePort = EMPTY_DIAGNOSE_PORT,
): ProductComposition {
  const byId = new Map<ProductSurfaceId, ProductSurfaceRegistration>();

  for (const registration of registrations) {
    if (byId.has(registration.id)) {
      throw new Error(`duplicate product surface: ${registration.id}`);
    }
    byId.set(registration.id, registration);
  }

  const surfaces = PRODUCT_ROUTE_CATALOG.flatMap((routeDefinition) => {
    const registration = byId.get(routeDefinition.id);
    return registration ? [registration] : [];
  });

  if (surfaces.length !== registrations.length) {
    const known = new Set(PRODUCT_ROUTE_CATALOG.map((routeDefinition) => routeDefinition.id));
    const unknown = registrations.find((registration) => !known.has(registration.id));
    throw new Error(`unknown product surface: ${String(unknown?.id)}`);
  }

  return {
    auth,
    clusterScope,
    globalFilter,
    aiAssistant,
    logStream,
    alertEvents,
    workloadDetail,
    compare,
    diagnose,
    operationStatusStore,
    surfaces,
    releasedSurfaceIds: new Set(surfaces.map((surface) => surface.id)),
    dispose,
  };
}
