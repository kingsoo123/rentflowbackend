/**
 * Typed view of configuration for ConfigModule.load().
 */
export interface AppConfiguration {
  port: number;
  nodeEnv: string;
  corsOrigin: string | string[] | true;
}

export default (): AppConfiguration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const parsedPort = parseInt(process.env.PORT ?? '3001', 10);
  const port =
    Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : 3001;

  return {
    /** Default 3001 so Next.js can use 3000 in the same monorepo. */
    port,
    nodeEnv,
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  };
};

function parseCorsOrigin(raw: string | undefined): string | string[] | true {
  if (!raw?.trim()) {
    return true;
  }
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return true;
  }
  return parts.length === 1 ? parts[0] : parts;
}
