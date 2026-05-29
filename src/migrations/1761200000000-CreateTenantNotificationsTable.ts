import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantNotificationsTable1761200000000
  implements MigrationInterface
{
  name = 'CreateTenantNotificationsTable1761200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "kind" character varying(32) NOT NULL,
        "headline" character varying(280) NOT NULL,
        "body" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "tenant_notifications_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_notifications_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_notifications_tenant_created"
      ON "tenant_notifications" ("tenant_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_notifications"`);
  }
}
