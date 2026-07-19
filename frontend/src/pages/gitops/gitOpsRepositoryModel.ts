import type {
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
import {
  gitOpsSyncCategory,
  type GitOpsSyncCategory,
} from "../../features/gitops/gitOpsPresentation";

export interface RepositoryGroup {
  applications: ReleaseApplication[];
  applicationIds: string[];
  key: string;
  providers: NonNullable<GitOpsSyncTarget["provider"]>[];
  repository: string | null;
  revisions: string[];
  rows: GitOpsSyncTarget[];
  status: GitOpsSyncCategory;
}

export function repositoryGroups(
  applications: ReleaseApplication[],
  rows: GitOpsSyncTarget[],
): RepositoryGroup[] {
  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const buckets = new Map<string, {
    applicationIds: Set<string>;
    providers: Set<NonNullable<GitOpsSyncTarget["provider"]>>;
    repository: string | null;
    revisions: Set<string>;
    rows: GitOpsSyncTarget[];
  }>();
  const bucketFor = (key: string, repository: string | null) => {
    const current = buckets.get(key);
    if (current) return current;
    const created = {
      applicationIds: new Set<string>(),
      providers: new Set<NonNullable<GitOpsSyncTarget["provider"]>>(),
      repository,
      revisions: new Set<string>(),
      rows: [] as GitOpsSyncTarget[],
    };
    buckets.set(key, created);
    return created;
  };

  applications.forEach((application) => {
    const repository = application.repository.trim() || null;
    const key = repository ? `repository:${repository}` : `application:${application.id}`;
    bucketFor(key, repository).applicationIds.add(application.id);
  });
  rows.forEach((row) => {
    const ids = row.applicationIds?.length ? [...row.applicationIds] : [row.applicationId];
    ids.forEach((applicationId) => {
      const application = applicationById.get(applicationId);
      const repository = application?.repository.trim() || null;
      const key = repository ? `repository:${repository}` : `application:${applicationId}`;
      const bucket = bucketFor(key, repository);
      bucket.applicationIds.add(applicationId);
      if (row.provider) bucket.providers.add(row.provider);
      if (row.revision) bucket.revisions.add(row.revision);
      bucket.rows.push({
        ...row,
        applicationId,
        applicationIds: [applicationId],
        applicationName: application?.name || row.applicationName,
      });
    });
  });

  return [...buckets.entries()].map(([key, bucket]) => ({
    applications: [...bucket.applicationIds]
      .map((applicationId) => applicationById.get(applicationId))
      .filter((application): application is ReleaseApplication => application !== undefined),
    applicationIds: [...bucket.applicationIds],
    key,
    providers: [...bucket.providers],
    repository: bucket.repository,
    revisions: [...bucket.revisions],
    rows: bucket.rows,
    status: aggregateStatus(bucket.rows),
  })).sort((left, right) => (left.repository ?? left.key).localeCompare(right.repository ?? right.key));
}

function aggregateStatus(rows: GitOpsSyncTarget[]): GitOpsSyncCategory {
  const categories = rows.map((row) => gitOpsSyncCategory(row.syncStatus));
  if (categories.includes("failed")) return "failed";
  if (categories.includes("out-of-sync")) return "out-of-sync";
  if (categories.includes("checking")) return "checking";
  if (categories.length && categories.every((category) => category === "synced")) return "synced";
  return "unknown";
}
