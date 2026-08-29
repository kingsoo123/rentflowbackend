import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationToUsers1763700000000 implements MigrationInterface {
  name = 'AddEmailVerificationToUsers1763700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "email_otp_hash" character varying(128),
      ADD COLUMN IF NOT EXISTS "email_otp_expires_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "email_otp_attempts" integer NOT NULL DEFAULT 0
    `);

    // Existing accounts were created without OTP — treat them as verified.
    await queryRunner.query(`
      UPDATE "users"
      SET "email_verified_at" = COALESCE("email_verified_at", "created_at")
      WHERE "email_verified_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "email_otp_attempts",
      DROP COLUMN IF EXISTS "email_otp_expires_at",
      DROP COLUMN IF EXISTS "email_otp_hash",
      DROP COLUMN IF EXISTS "email_verified_at"
    `);
  }
}
