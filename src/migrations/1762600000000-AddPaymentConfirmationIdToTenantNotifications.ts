import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentConfirmationIdToTenantNotifications1762600000000
  implements MigrationInterface
{
  name = 'AddPaymentConfirmationIdToTenantNotifications1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD COLUMN IF NOT EXISTS "payment_confirmation_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD CONSTRAINT "FK_tenant_notifications_payment_confirmation"
      FOREIGN KEY ("payment_confirmation_id")
      REFERENCES "tenant_payment_confirmations"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      DROP CONSTRAINT IF EXISTS "FK_tenant_notifications_payment_confirmation"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      DROP COLUMN IF EXISTS "payment_confirmation_id"
    `);
  }
}
