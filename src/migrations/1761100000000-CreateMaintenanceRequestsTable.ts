import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceRequestsTable1761100000000
  implements MigrationInterface
{
  name = 'CreateMaintenanceRequestsTable1761100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "maintenance_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "urgency" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'submitted',
        "attachment_urls" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_maintenance_requests_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_maintenance_requests_tenant_id"
      ON "maintenance_requests" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_maintenance_requests_created_at"
      ON "maintenance_requests" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "maintenance_requests"`);
  }
}
