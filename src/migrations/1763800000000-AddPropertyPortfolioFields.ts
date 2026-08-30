import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyPortfolioFields1763800000000 implements MigrationInterface {
  name = 'AddPropertyPortfolioFields1763800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "property_type" character varying(32),
        ADD COLUMN IF NOT EXISTS "amenities" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "image_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "buildings" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "property_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "document_type" character varying(40) NOT NULL,
        "url" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_property_documents_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_property_documents_property_id"
        ON "property_documents" ("property_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "property_manager_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL,
        "manager_user_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "property_manager_assignments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_property_manager_assignment" UNIQUE ("property_id", "manager_user_id"),
        CONSTRAINT "FK_pma_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pma_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pma_manager_user_id"
        ON "property_manager_assignments" ("manager_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "property_manager_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "property_documents"`);
    await queryRunner.query(`
      ALTER TABLE "properties"
        DROP COLUMN IF EXISTS "buildings",
        DROP COLUMN IF EXISTS "image_urls",
        DROP COLUMN IF EXISTS "amenities",
        DROP COLUMN IF EXISTS "property_type"
    `);
  }
}
