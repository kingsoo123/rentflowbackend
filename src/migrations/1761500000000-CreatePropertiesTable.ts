import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePropertiesTable1761500000000 implements MigrationInterface {
  name = 'CreatePropertiesTable1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "properties" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "properties_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_properties_manager_user" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_properties_manager_user_id" ON "properties" ("manager_user_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_properties_manager_normalized_name"
      ON "properties" ("manager_user_id", (lower(trim("name"))))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "properties"`);
  }
}
