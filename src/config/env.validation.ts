import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsPort,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * Ensures the URI has an explicit database segment (e.g. `/postgres`).
 * Without it, libpq uses the username as the database name — with Supabase
 * pooler usernames like `postgres.xxx` this causes "database does not exist".
 */
function normalizeAndAssertPostgresUrl(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }

  if (!/^postgres(ql)?:\/\//i.test(s)) {
    throw new Error(
      'DATABASE_URL must start with postgres:// or postgresql:// (not jdbc: or https://).',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(s.replace(/^postgres(ql)?:\/\//i, 'http://'));
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. If the password contains @, #, %, or spaces, URL-encode it (e.g. @ → %40).',
    );
  }

  const db =
    parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';

  if (!db) {
    throw new Error(
      'DATABASE_URL must include the database name after host:port, usually /postgres for Supabase. Example: ...supabase.com:6543/postgres?pgbouncer=true — see docs/supabase-postgres-url.md',
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    (host.includes('supabase.com') || host.endsWith('.supabase.co')) &&
    db.toLowerCase() !== 'postgres'
  ) {
    throw new Error(
      `DATABASE_URL uses database "${db}"; Supabase’s default database name is postgres. Change the path to /postgres (see docs/supabase-postgres-url.md).`,
    );
  }

  return s;
}

/**
 * Environment variables loaded by @nestjs/config before the app boots.
 * Add fields here as you introduce new configuration.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsPort()
  PORT?: string;

  @IsOptional()
  @IsString()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  /** Supabase Postgres URI from Dashboard → Settings → Database */
  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsBooleanString()
  TYPEORM_SYNCHRONIZE?: string;

  @IsOptional()
  @IsBooleanString()
  TYPEORM_LOGGING?: string;

  /**
   * Set to "false" only for local Postgres without TLS.
   * Supabase cloud requires TLS (default: enabled when not "false").
   */
  @IsOptional()
  @IsBooleanString()
  DATABASE_SSL?: string;

  /** Comma-separated origins, or omit to allow all origins in development */
  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const dbUrl = config.DATABASE_URL ?? process.env.DATABASE_URL;
  if (dbUrl === undefined || dbUrl === null || String(dbUrl).trim() === '') {
    throw new Error(
      'DATABASE_URL is missing or empty. In real_estate_backend, copy .env.example to .env, then set DATABASE_URL to your Postgres URI (Supabase: Project Settings → Database → connection string).',
    );
  }

  const normalized = normalizeAndAssertPostgresUrl(String(dbUrl));
  (config as Record<string, unknown>).DATABASE_URL = normalized;
  if (process.env.DATABASE_URL !== undefined) {
    process.env.DATABASE_URL = normalized;
  }

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    forbidUnknownValues: false,
    skipMissingProperties: false,
    skipUndefinedProperties: false,
  });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return validated;
}
