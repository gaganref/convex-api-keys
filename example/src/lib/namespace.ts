export const environments = ["production", "testing"] as const;

export type Environment = (typeof environments)[number];

export function toNamespace(
  workspace: string,
  environment: Environment,
): string {
  return `${workspace}:${environment}`;
}

export function parseNamespace(namespace: string): {
  workspace: string;
  environment: Environment;
} | null {
  const separatorIndex = namespace.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= namespace.length - 1) {
    return null;
  }

  const workspace = namespace.slice(0, separatorIndex);
  const environment = namespace.slice(separatorIndex + 1);
  if (environment !== "production" && environment !== "testing") {
    return null;
  }

  return {
    workspace,
    environment,
  };
}
