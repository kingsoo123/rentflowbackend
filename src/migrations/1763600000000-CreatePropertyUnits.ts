import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePropertyUnits1763600000000 implements MigrationInterface {
  name = 'CreatePropertyUnits1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "property_units" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL,
        "label" character varying(120) NOT NULL,
        "notes" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "property_units_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_property_units_property" FOREIGN KEY ("property_id")
          REFERENCES "properties"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_property_units_property_id" ON "property_units" ("property_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_property_units_property_normalized_label"
      ON "property_units" ("property_id", (lower(trim("label"))))
    `);

    // Seed units from existing free-text tenant unit numbers matched to portfolio properties.
    await queryRunner.query(`
      INSERT INTO "property_units" ("property_id", "label")
      SELECT DISTINCT ON (p.id, lower(trim(tp.profile_data->>'unitNumber')))
        p.id,
        trim(tp.profile_data->>'unitNumber')
      FROM tenant_profiles tp
      INNER JOIN users u ON u.id = tp.user_id AND u.role = 'tenant'
      INNER JOIN properties p
        ON LOWER(TRIM(COALESCE(tp.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
      WHERE COALESCE(trim(tp.profile_data->>'unitNumber'), '') <> ''
      ORDER BY p.id, lower(trim(tp.profile_data->>'unitNumber'))
    `);

    // Backfill unitId onto tenant profiles where we can match label + property.
    await queryRunner.query(`
      UPDATE tenant_profiles AS tp
      SET profile_data = jsonb_set(
        COALESCE(tp.profile_data, '{}'::jsonb),
        '{unitId}',
        to_jsonb(matched.unit_id::text),
        true
      )
      FROM (
        SELECT tp2.id AS profile_id, pu.id AS unit_id
        FROM tenant_profiles tp2
        INNER JOIN users u ON u.id = tp2.user_id AND u.role = 'tenant'
        INNER JOIN properties p
          ON LOWER(TRIM(COALESCE(tp2.profile_data->>'propertyAssigned',''))) = LOWER(TRIM(p.name))
        INNER JOIN property_units pu
          ON pu.property_id = p.id
         AND LOWER(TRIM(pu.label)) = LOWER(TRIM(COALESCE(tp2.profile_data->>'unitNumber','')))
        WHERE COALESCE(trim(tp2.profile_data->>'unitNumber'), '') <> ''
          AND COALESCE(tp2.profile_data->>'unitId', '') = ''
      ) AS matched
      WHERE tp.id = matched.profile_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "property_units"`);
  }
}
