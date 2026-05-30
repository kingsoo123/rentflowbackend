import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePropertyBroadcasts1761400000000
  implements MigrationInterface
{
  name = 'CreatePropertyBroadcasts1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "property_broadcasts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_id" uuid NOT NULL,
        "headline" character varying(280) NOT NULL,
        "body" text NOT NULL,
        "tenant_count" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "property_broadcasts_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_property_broadcasts_manager"
          FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_property_broadcasts_manager_created"
      ON "property_broadcasts" ("manager_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD COLUMN "broadcast_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_notifications"
      ADD CONSTRAINT "FK_tenant_notifications_broadcast"
        FOREIGN KEY ("broadcast_id") REFERENCES "property_broadcasts"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_notifications_broadcast"
      ON "tenant_notifications" ("broadcast_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_notifications" DROP CONSTRAINT "FK_tenant_notifications_broadcast"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tenant_notifications_broadcast"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_notifications" DROP COLUMN "broadcast_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_property_broadcasts_manager_created"`);
    await queryRunner.query(`DROP TABLE "property_broadcasts"`);
  }
}
