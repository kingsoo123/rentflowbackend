import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDirectMessages1762700000000 implements MigrationInterface {
  name = 'CreateDirectMessages1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "direct_message_threads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "direct_message_threads_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_direct_message_threads_manager_tenant" UNIQUE ("manager_user_id", "tenant_id"),
        CONSTRAINT "FK_direct_message_threads_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_direct_message_threads_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_direct_message_threads_manager_updated"
      ON "direct_message_threads" ("manager_user_id", "updated_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_direct_message_threads_tenant_updated"
      ON "direct_message_threads" ("tenant_id", "updated_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "direct_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "thread_id" uuid NOT NULL,
        "sender_user_id" uuid NOT NULL,
        "sender_role" character varying(32) NOT NULL,
        "body" text NOT NULL,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_direct_messages_thread" FOREIGN KEY ("thread_id")
          REFERENCES "direct_message_threads"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_direct_messages_sender" FOREIGN KEY ("sender_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_direct_messages_thread_created"
      ON "direct_messages" ("thread_id", "created_at" ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "direct_messages"`);
    await queryRunner.query(`DROP TABLE "direct_message_threads"`);
  }
}
