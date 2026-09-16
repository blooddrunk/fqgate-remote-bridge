export interface SemVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(value: unknown): SemVersion | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = VERSION_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return undefined;
  }

  const prerelease = match[4] === undefined ? [] : match[4].split(".");
  if (prerelease.some((part) => part.length === 0 || (/^\d+$/.test(part) && part.length > 1))) {
    return undefined;
  }

  return { major, minor, patch, prerelease };
}

export function formatVersion(version: SemVersion): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length > 0 ? `${base}-${version.prerelease.join(".")}` : base;
}

export function compareVersions(left: SemVersion, right: SemVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length > 0) {
    return 1;
  }
  if (left.prerelease.length > 0 && right.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart === rightPart) {
      continue;
    }

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) < Number(rightPart) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftPart < rightPart ? -1 : 1;
  }

  return 0;
}

export function versionsEqual(left: string, right: string): boolean {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  return (
    leftVersion !== undefined &&
    rightVersion !== undefined &&
    compareVersions(leftVersion, rightVersion) === 0
  );
}

interface RangeComparator {
  readonly operator: ">" | ">=" | "<" | "<=" | "=";
  readonly version: SemVersion;
}

export interface VersionRange {
  readonly expression: string;
  readonly comparators: readonly RangeComparator[];
}

export function parseVersionRange(expression: string): VersionRange | undefined {
  if (expression.trim().length === 0) {
    return undefined;
  }

  const comparators: RangeComparator[] = [];
  for (const token of expression.trim().split(/\s+/)) {
    const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
    if (match === null) {
      return undefined;
    }
    const version = parseVersion(match[2]);
    if (version === undefined) {
      return undefined;
    }
    comparators.push({ operator: (match[1] ?? "=") as RangeComparator["operator"], version });
  }

  return { expression, comparators };
}

export function satisfiesRange(version: SemVersion, range: VersionRange): boolean {
  return range.comparators.every((comparator) => {
    const comparison = compareVersions(version, comparator.version);
    switch (comparator.operator) {
      case ">":
        return comparison > 0;
      case ">=":
        return comparison >= 0;
      case "<":
        return comparison < 0;
      case "<=":
        return comparison <= 0;
      case "=":
        return comparison === 0;
    }
  });
}
