import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantPaymentConfirmations1762400000000
  implements MigrationInterface
{
  name = 'CreateTenantPaymentConfirmations1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
      ADD COLUMN IF NOT EXISTS "collection_bank_name" character varying(120),
      ADD COLUMN IF NOT EXISTS "collection_account_name" character varying(200),
      ADD COLUMN IF NOT EXISTS "collection_account_number" character varying(64),
      ADD COLUMN IF NOT EXISTS "collection_payment_instructions" text
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_payment_confirmations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "manager_user_id" uuid NOT NULL,
        "property_id" uuid,
        "payment_type" character varying(32) NOT NULL,
        "amount_display" character varying(64),
        "receipt_image_path" character varying(512) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "tenant_payment_confirmations_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_payment_confirmations_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_payment_confirmations_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_payment_confirmations_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_payment_confirmations_manager_id"
      ON "tenant_payment_confirmations" ("manager_user_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_payment_confirmations_tenant_id"
      ON "tenant_payment_confirmations" ("tenant_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_payment_confirmations"`);
    await queryRunner.query(`
      ALTER TABLE "properties"
      DROP COLUMN IF EXISTS "collection_payment_instructions",
      DROP COLUMN IF EXISTS "collection_account_number",
      DROP COLUMN IF EXISTS "collection_account_name",
      DROP COLUMN IF EXISTS "collection_bank_name"
    `);
  }
}
