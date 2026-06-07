import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyAddressColumns1761600000000 implements MigrationInterface {
  name = 'AddPropertyAddressColumns1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
      ADD COLUMN "address_line" text,
      ADD COLUMN "city" character varying(120),
      ADD COLUMN "state_region" character varying(120),
      ADD COLUMN "postal_code" character varying(32),
      ADD COLUMN "country" character varying(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
      DROP COLUMN IF EXISTS "address_line",
      DROP COLUMN IF EXISTS "city",
      DROP COLUMN IF EXISTS "state_region",
      DROP COLUMN IF EXISTS "postal_code",
      DROP COLUMN IF EXISTS "country"
    `);
  }
}
