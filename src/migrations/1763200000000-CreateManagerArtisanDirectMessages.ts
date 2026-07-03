import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagerArtisanDirectMessages1763200000000 implements MigrationInterface {
  name = 'CreateManagerArtisanDirectMessages1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "manager_artisan_direct_message_threads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "artisan_user_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "manager_artisan_direct_message_threads_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_manager_artisan_dm_threads_pair" UNIQUE ("manager_user_id", "artisan_user_id"),
        CONSTRAINT "FK_manager_artisan_dm_threads_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manager_artisan_dm_threads_artisan" FOREIGN KEY ("artisan_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_manager_artisan_dm_threads_manager_updated"
      ON "manager_artisan_direct_message_threads" ("manager_user_id", "updated_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_manager_artisan_dm_threads_artisan_updated"
      ON "manager_artisan_direct_message_threads" ("artisan_user_id", "updated_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "manager_artisan_direct_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "thread_id" uuid NOT NULL,
        "sender_user_id" uuid NOT NULL,
        "sender_role" character varying(32) NOT NULL,
        "body" text NOT NULL,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "manager_artisan_direct_messages_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manager_artisan_dm_messages_thread" FOREIGN KEY ("thread_id")
          REFERENCES "manager_artisan_direct_message_threads"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manager_artisan_dm_messages_sender" FOREIGN KEY ("sender_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_manager_artisan_dm_messages_thread_created"
      ON "manager_artisan_direct_messages" ("thread_id", "created_at" ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "manager_artisan_direct_messages"`);
    await queryRunner.query(`DROP TABLE "manager_artisan_direct_message_threads"`);
  }
}
