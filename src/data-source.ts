import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildPostgresConnection } from './config/typeorm.config';

config({ path: join(__dirname, '..', '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL must be set to use the TypeORM CLI.');
}

const conn = buildPostgresConnection(url);

export default new DataSource({
  type: 'postgres',
  ...conn,
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
