import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInspectionRecords1763300000000 implements MigrationInterface {
  name = 'CreateInspectionRecords1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inspection_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "property_id" uuid NOT NULL,
        "tenant_id" uuid,
        "type" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'draft',
        "unit_label" character varying(120),
        "inspected_at" date NOT NULL,
        "notes" text,
        "overall_condition" character varying(32),
        "checklist_items" jsonb NOT NULL DEFAULT '[]',
        "photo_urls" jsonb NOT NULL DEFAULT '[]',
        "manager_signed_at" TIMESTAMPTZ,
        "tenant_signed_at" TIMESTAMPTZ,
        "tenant_signature_name" character varying(200),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "inspection_records_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inspection_records_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inspection_records_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inspection_records_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inspection_records_manager_user_id"
      ON "inspection_records" ("manager_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inspection_records_property_id"
      ON "inspection_records" ("property_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inspection_records_tenant_id"
      ON "inspection_records" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inspection_records_inspected_at"
      ON "inspection_records" ("inspected_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "inspection_records"`);
  }
}
