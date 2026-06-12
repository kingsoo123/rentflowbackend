import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenProviderToUserDevicePushTokens1762200000000 implements MigrationInterface {
  name = 'AddTokenProviderToUserDevicePushTokens1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_device_push_tokens"
      ADD COLUMN "token_provider" character varying(16) NOT NULL DEFAULT 'native'
    `);
    await queryRunner.query(`
      ALTER TABLE "user_device_push_tokens"
      ADD CONSTRAINT "CHK_user_device_push_tokens_token_provider"
      CHECK ("token_provider" IN ('native', 'expo'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_device_push_tokens" DROP CONSTRAINT "CHK_user_device_push_tokens_token_provider"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_device_push_tokens" DROP COLUMN "token_provider"
    `);
  }
}
