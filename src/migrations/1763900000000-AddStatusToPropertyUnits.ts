import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToPropertyUnits1763900000000 implements MigrationInterface {
  name = 'AddStatusToPropertyUnits1763900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_units"
      ADD COLUMN IF NOT EXISTS "status" character varying(32) NOT NULL DEFAULT 'available'
    `);
    await queryRunner.query(`
      UPDATE "property_units"
      SET "status" = 'available'
      WHERE "status" IS NULL OR TRIM("status") = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_units" DROP COLUMN IF EXISTS "status"
    `);
  }
}
