/**
 * Typed view of configuration for ConfigModule.load().
 */
export interface AppConfiguration {
  port: number;
  nodeEnv: string;
  corsOrigin: string | string[] | true;
  cloudinary: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  };
}

export default (): AppConfiguration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const parsedPort = parseInt(process.env.PORT ?? '3002', 10);
  const port =
    Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : 3002;

  return {
    /** Default 3002: Next.js often uses 3000 and may take 3001 when 3000 is busy. */
    port,
    nodeEnv,
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || null,
      apiKey: process.env.CLOUDINARY_API_KEY?.trim() || null,
      apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || null,
    },
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
