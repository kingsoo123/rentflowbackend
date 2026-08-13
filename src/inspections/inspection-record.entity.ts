import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { InspectionChecklistItem } from './inspection-checklist';
import type { InspectionOverallCondition } from './inspection-condition.enum';
import { InspectionStatus } from './inspection-status.enum';
import { InspectionType } from './inspection-type.enum';

@Entity('inspection_records')
export class InspectionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @Column({ name: 'property_id', type: 'uuid' })
  propertyId: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 32 })
  type: InspectionType;

  @Column({ type: 'varchar', length: 32, default: InspectionStatus.DRAFT })
  status: InspectionStatus;

  @Column({ name: 'unit_label', type: 'varchar', length: 120, nullable: true })
  unitLabel: string | null;

  @Column({ name: 'inspected_at', type: 'date' })
  inspectedAt: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'overall_condition',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  overallCondition: InspectionOverallCondition | null;

  @Column({
    name: 'checklist_items',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  checklistItems: InspectionChecklistItem[];

  @Column({
    name: 'photo_urls',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  photoUrls: string[];

  @Column({ name: 'manager_signed_at', type: 'timestamptz', nullable: true })
  managerSignedAt: Date | null;

  @Column({ name: 'tenant_signed_at', type: 'timestamptz', nullable: true })
  tenantSignedAt: Date | null;

  @Column({
    name: 'tenant_signature_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  tenantSignatureName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
