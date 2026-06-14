import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantLeaseFormSubmissions1762300000000
  implements MigrationInterface
{
  name = 'CreateTenantLeaseFormSubmissions1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_lease_form_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "form_slug" character varying(80) NOT NULL,
        "answers" jsonb NOT NULL DEFAULT '{}',
        "signature_text" character varying(500) NOT NULL,
        "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_lease_form_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_lease_form_submissions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_lease_form_submissions_tenant" ON "tenant_lease_form_submissions" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tenant_lease_form_submissions_submitted" ON "tenant_lease_form_submissions" ("submitted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tenant_lease_form_submissions_submitted"`);
    await queryRunner.query(`DROP INDEX "IDX_tenant_lease_form_submissions_tenant"`);
    await queryRunner.query(`DROP TABLE "tenant_lease_form_submissions"`);
  }
}
