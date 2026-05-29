import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantProfilesTable1761000000000
  implements MigrationInterface
{
  name = 'CreateTenantProfilesTable1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "profile_data" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_tenant_profiles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_profiles_user_id" ON "tenant_profiles" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_profiles"`);
  }
}
