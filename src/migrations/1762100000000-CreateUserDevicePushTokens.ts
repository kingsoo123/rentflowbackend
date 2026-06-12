import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserDevicePushTokens1762100000000 implements MigrationInterface {
  name = 'CreateUserDevicePushTokens1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_device_push_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token" text NOT NULL,
        "platform" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "user_device_push_tokens_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_device_push_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_user_device_push_tokens_user_token" UNIQUE ("user_id", "token")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_device_push_tokens_user_id"
      ON "user_device_push_tokens" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_device_push_tokens"`);
  }
}
