import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePricingCheckouts1764000000000 implements MigrationInterface {
  name = 'CreatePricingCheckouts1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pricing_checkouts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tx_ref" character varying(128) NOT NULL,
        "plan_id" character varying(32) NOT NULL,
        "plan_name" character varying(120) NOT NULL,
        "amount_ngn" integer NOT NULL,
        "currency" character varying(32) NOT NULL DEFAULT 'NGN',
        "customer_name" character varying(200) NOT NULL,
        "customer_email" character varying(320) NOT NULL,
        "customer_phone" character varying(32),
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "flutterwave_transaction_id" character varying(64),
        "flutterwave_flw_ref" character varying(128),
        "checkout_url" character varying(512),
        "paid_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pricing_checkouts_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pricing_checkouts_tx_ref" UNIQUE ("tx_ref")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pricing_checkouts_status_created"
      ON "pricing_checkouts" ("status", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pricing_checkouts"`);
  }
}
