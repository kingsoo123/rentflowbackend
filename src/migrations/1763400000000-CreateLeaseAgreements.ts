import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeaseAgreements1763400000000 implements MigrationInterface {
  name = 'CreateLeaseAgreements1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lease_agreements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "manager_user_id" uuid NOT NULL,
        "property_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "unit_label" character varying(120),
        "title" character varying(200) NOT NULL,
        "status" character varying(48) NOT NULL DEFAULT 'draft',
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "rent_amount" character varying(64) NOT NULL,
        "security_deposit" character varying(64),
        "payment_frequency" character varying(64),
        "terms_text" text NOT NULL,
        "document_url" character varying(1000),
        "tenant_signature_name" character varying(200),
        "tenant_signed_at" TIMESTAMPTZ,
        "manager_signature_name" character varying(200),
        "manager_signed_at" TIMESTAMPTZ,
        "terminated_at" TIMESTAMPTZ,
        "termination_reason" text,
        "parent_lease_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "lease_agreements_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lease_agreements_manager" FOREIGN KEY ("manager_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lease_agreements_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lease_agreements_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lease_agreements_parent" FOREIGN KEY ("parent_lease_id")
          REFERENCES "lease_agreements"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lease_agreements_manager_user_id"
      ON "lease_agreements" ("manager_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lease_agreements_property_id"
      ON "lease_agreements" ("property_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lease_agreements_tenant_id"
      ON "lease_agreements" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lease_agreements_status"
      ON "lease_agreements" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lease_agreements_end_date"
      ON "lease_agreements" ("end_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lease_agreements"`);
  }
}
