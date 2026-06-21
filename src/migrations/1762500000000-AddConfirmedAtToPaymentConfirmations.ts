import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfirmedAtToPaymentConfirmations1762500000000
  implements MigrationInterface
{
  name = 'AddConfirmedAtToPaymentConfirmations1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_payment_confirmations"
      ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_payment_confirmations"
      DROP COLUMN IF EXISTS "confirmed_at"
    `);
  }
}
