import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtisanNotifications1763100000000 implements MigrationInterface {
  name = 'CreateArtisanNotifications1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "artisan_notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "artisan_user_id" uuid NOT NULL,
        "kind" character varying(32) NOT NULL,
        "headline" character varying(280) NOT NULL,
        "body" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "assignment_id" uuid,
        "maintenance_request_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "artisan_notifications_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_artisan_notifications_artisan"
          FOREIGN KEY ("artisan_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_artisan_notifications_artisan_created"
      ON "artisan_notifications" ("artisan_user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "artisan_notifications"`);
  }
}
