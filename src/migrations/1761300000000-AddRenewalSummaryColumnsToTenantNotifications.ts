import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRenewalSummaryColumnsToTenantNotifications1761300000000
  implements MigrationInterface
{
  name = 'AddRenewalSummaryColumnsToTenantNotifications1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD COLUMN IF NOT EXISTS "renewal_monthly_rent_display" character varying(128)
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD COLUMN IF NOT EXISTS "renewal_effective_date" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      DROP COLUMN IF EXISTS "renewal_effective_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      DROP COLUMN IF EXISTS "renewal_monthly_rent_display"
    `);
  }
}
