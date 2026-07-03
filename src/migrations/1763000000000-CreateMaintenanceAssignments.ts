import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceAssignments1763000000000
  implements MigrationInterface
{
  name = 'CreateMaintenanceAssignments1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "maintenance_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "maintenance_request_id" uuid NOT NULL,
        "manager_user_id" uuid NOT NULL,
        "artisan_user_id" uuid NOT NULL,
        "status" character varying(32) NOT NULL,
        "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "accept_by" TIMESTAMPTZ NOT NULL,
        "responded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "maintenance_assignments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_maintenance_assignments_request"
          FOREIGN KEY ("maintenance_request_id") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_maintenance_assignments_manager"
          FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_maintenance_assignments_artisan"
          FOREIGN KEY ("artisan_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_maintenance_assignments_request"
      ON "maintenance_assignments" ("maintenance_request_id", "assigned_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_maintenance_assignments_artisan_status"
      ON "maintenance_assignments" ("artisan_user_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "maintenance_assignments"`);
  }
}
