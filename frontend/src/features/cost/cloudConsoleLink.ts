export type CloudConsoleResourceIdentity =
  | {
      provider: "aws";
      resourceType: "cluster" | "node";
      region: string;
      resourceId: string;
    }
  | {
      provider: "gcp";
      resourceType: "cluster" | "node";
      projectId: string;
      location: string;
      resourceId: string;
    };

export interface CloudConsoleLink {
  provider: CloudConsoleResourceIdentity["provider"];
  url: string;
}

const AWS_REGION = /^(?:af|ap|ca|eu|il|me|mx|sa|us)-(?:[a-z0-9]+-)+\d$/;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const GCP_PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const GCP_LOCATION = /^[a-z0-9][a-z0-9-]{0,62}$/;
const AWS_CONSOLE_HOST = /^[a-z0-9-]+\.console\.aws\.amazon\.com$/;
const GCP_CONSOLE_HOST = "console.cloud.google.com";

export function cloudConsoleLink(
  identity: CloudConsoleResourceIdentity | null,
): CloudConsoleLink | null {
  if (identity === null || !RESOURCE_ID.test(identity.resourceId)) return null;
  const url = identity.provider === "aws" ? awsConsoleUrl(identity) : gcpConsoleUrl(identity);
  if (url === null || !isAllowedConsoleUrl(url)) return null;
  return { provider: identity.provider, url: url.toString() };
}

function awsConsoleUrl(
  identity: Extract<CloudConsoleResourceIdentity, { provider: "aws" }>,
): URL | null {
  if (!AWS_REGION.test(identity.region)) return null;
  const url = new URL(`https://${identity.region}.console.aws.amazon.com`);
  if (identity.resourceType === "node") {
    url.pathname = "/ec2/home";
    url.searchParams.set("region", identity.region);
    url.hash = `InstanceDetails:instanceId=${encodeURIComponent(identity.resourceId)}`;
  } else {
    url.pathname = "/eks/home";
    url.searchParams.set("region", identity.region);
    url.hash = `/clusters/${encodeURIComponent(identity.resourceId)}`;
  }
  return url;
}

function gcpConsoleUrl(
  identity: Extract<CloudConsoleResourceIdentity, { provider: "gcp" }>,
): URL | null {
  if (!GCP_PROJECT.test(identity.projectId) || !GCP_LOCATION.test(identity.location)) return null;
  const url = new URL(`https://${GCP_CONSOLE_HOST}`);
  if (identity.resourceType === "node") {
    url.pathname = [
      "compute",
      "instancesDetail",
      "zones",
      identity.location,
      "instances",
      identity.resourceId,
    ].map(encodeURIComponent).join("/");
  } else {
    url.pathname = [
      "kubernetes",
      "clusters",
      "details",
      identity.location,
      identity.resourceId,
      "details",
    ].map(encodeURIComponent).join("/");
  }
  url.searchParams.set("project", identity.projectId);
  return url;
}

function isAllowedConsoleUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return url.hostname === GCP_CONSOLE_HOST || AWS_CONSOLE_HOST.test(url.hostname);
}
