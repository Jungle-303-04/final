export function shortIdentity(value: string, maxLength = 36): string {
  const internalNode = /^([a-z0-9-]+)\.(?:[a-z0-9-]+\.)*compute\.internal$/iu.exec(value);
  if (internalNode) return internalNode[1]!;
  const sha = /^(sha256:)?([a-f0-9]{16,})$/iu.exec(value);
  if (sha) {
    const prefix = sha[1] ?? "";
    const digest = sha[2]!;
    return `${prefix}${digest.slice(0, 10)}…${digest.slice(-8)}`;
  }
  if (value.length <= maxLength) return value;
  const revision = /^(.*)-([a-z0-9]{8,10})$/iu.exec(value);
  if (revision) {
    const suffix = revision[2]!;
    const baseBudget = Math.max(8, maxLength - suffix.length - 3);
    return `${middleEllipsis(revision[1]!, baseBudget)} · ${suffix}`;
  }
  return middleEllipsis(value, maxLength);
}

function middleEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const available = Math.max(4, maxLength - 1);
  const start = Math.ceil(available / 2);
  const end = Math.floor(available / 2);
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}
