import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagerArtisanRoster1762900000000
  implements MigrationInterface
{
  name = 'CreateManagerArtisanRoster1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "manager_artisan_roster" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "artisan_user_id" uuid NOT NULL,
        "profile_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "manager_artisan_roster_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_manager_artisan_roster_pair"
          UNIQUE ("manager_user_id", "artisan_user_id"),
        CONSTRAINT "FK_manager_artisan_roster_manager"
          FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manager_artisan_roster_artisan"
          FOREIGN KEY ("artisan_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_manager_artisan_roster_manager_created"
      ON "manager_artisan_roster" ("manager_user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "manager_artisan_roster"`);
  }
}
