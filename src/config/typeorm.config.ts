import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as net from 'node:net';
import type { ConnectionOptions } from 'node:tls';
import { execFileSync } from 'node:child_process';
import { parse } from 'pg-connection-string';

/**
 * Synchronous IPv4 lookup without `dns.lookupSync` (not exposed in Node 22).
 * Spawns a one-liner child so TypeORM + DataSource can stay sync.
 */
function lookupIpv4Address(hostname: string): string {
  const quoted = JSON.stringify(hostname);
  const script = `require('node:dns').promises.lookup(${quoted},{family:4}).then(r=>process.stdout.write(r.address)).catch(e=>{process.stderr.write(e.code||e.message||'err');process.exit(1);});`;
  const out = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    maxBuffer: 4096,
    windowsHide: true,
  }).trim();
  if (!out || net.isIP(out) !== 4) {
    throw new Error(`IPv4 lookup for ${hostname} returned invalid result`);
  }
  return out;
}

/**
 * TypeORM options for PostgreSQL (Supabase uses Postgres).
 * Use the "Transaction" pooler URI with `?pgbouncer=true` when using port 6543.
 */
export function createTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const url = configService.getOrThrow<string>('DATABASE_URL');
  const conn = buildPostgresConnection(url);

  return {
    type: 'postgres',
    ...conn,
    autoLoadEntities: true,
    synchronize: configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
    logging: configService.get<string>('TYPEORM_LOGGING') === 'true',
    extra: {
      max: parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
    },
  };
}

export function resolvePostgresSsl(
  databaseUrl: string,
): false | Pick<ConnectionOptions, 'rejectUnauthorized'> {
  if (process.env.DATABASE_SSL === 'false') {
    return false;
  }
  if (process.env.DATABASE_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  const looksLocal =
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('@postgres:');
  if (looksLocal) {
    return false;
  }
  return { rejectUnauthorized: false };
}

type PgConn =
  | { url: string; ssl: false | Pick<ConnectionOptions, 'rejectUnauthorized'> }
  | {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      ssl:
        | false
        | (Pick<ConnectionOptions, 'rejectUnauthorized'> & { servername: string });
    };

/**
 * Resolves the DB hostname to IPv4 and connects by IP with TLS `servername`
 * set to the original host (required for Supabase certs). Avoids `ENETUNREACH`
 * when `net.connect` would otherwise use an unreachable AAAA first.
 *
 * Set `DATABASE_RESOLVE_IPV4=false` to use the URL as-is.
 */
export function buildPostgresConnection(databaseUrl: string): PgConn {
  const ssl = resolvePostgresSsl(databaseUrl);

  if (process.env.DATABASE_RESOLVE_IPV4 === 'false') {
    return { url: databaseUrl, ssl };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(databaseUrl);
  } catch {
    return { url: databaseUrl, ssl };
  }

  const hostname = parsed.host;
  if (!hostname || net.isIP(hostname)) {
    return { url: databaseUrl, ssl };
  }

  try {
    const address = lookupIpv4Address(hostname);
    const sslWithSni: PgConn['ssl'] =
      ssl === false ? false : { ...ssl, servername: hostname };
    return {
      host: address,
      port: parsed.port ? Number(parsed.port) : 5432,
      username: parsed.user ?? 'postgres',
      password: parsed.password ?? '',
      database: parsed.database ?? 'postgres',
      ssl: sslWithSni,
    };
  } catch {
    return { url: databaseUrl, ssl };
  }
}
