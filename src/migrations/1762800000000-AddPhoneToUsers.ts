import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneToUsers1762800000000 implements MigrationInterface {
  name = 'AddPhoneToUsers1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "phone_country_code" character varying(8),
      ADD COLUMN "phone_number" character varying(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "phone_number",
      DROP COLUMN "phone_country_code"
    `);
  }
}
