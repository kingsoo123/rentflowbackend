import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitCountToProperties1763500000000 implements MigrationInterface {
  name = 'AddUnitCountToProperties1763500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
      ADD COLUMN "unit_count" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN "unit_count"
    `);
  }
}
