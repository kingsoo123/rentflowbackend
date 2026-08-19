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

/** Always allowed so local Next.js and the Netlify site can call the API. */
const DEFAULT_BROWSER_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://estateman.netlify.app',
];

function parseCorsOrigin(raw: string | undefined): string | string[] | true {
  const fromEnv = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (fromEnv.length === 0) {
    return true;
  }

  const parts = [...new Set([...fromEnv, ...DEFAULT_BROWSER_ORIGINS])];
  return parts.length === 1 ? parts[0] : parts;
}
