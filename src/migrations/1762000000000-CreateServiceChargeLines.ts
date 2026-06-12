import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceChargeLines1762000000000 implements MigrationInterface {
  name = 'CreateServiceChargeLines1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_charge_lines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL,
        "label" character varying(200) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "service_charge_lines_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_charge_lines_property"
          FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_service_charge_lines_property_id"
      ON "service_charge_lines" ("property_id", "sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "service_charge_lines"`);
  }
}
