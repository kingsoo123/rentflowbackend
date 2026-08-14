import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaseStatus } from './lease-status.enum';

@Entity('lease_agreements')
export class LeaseAgreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @Column({ name: 'property_id', type: 'uuid' })
  propertyId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'unit_label', type: 'varchar', length: 120, nullable: true })
  unitLabel: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 48, default: LeaseStatus.DRAFT })
  status: LeaseStatus;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'rent_amount', type: 'varchar', length: 64 })
  rentAmount: string;

  @Column({ name: 'security_deposit', type: 'varchar', length: 64, nullable: true })
  securityDeposit: string | null;

  @Column({ name: 'payment_frequency', type: 'varchar', length: 64, nullable: true })
  paymentFrequency: string | null;

  @Column({ name: 'terms_text', type: 'text' })
  termsText: string;

  /** Optional link to an external/scanned master lease PDF. */
  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl: string | null;

  @Column({ name: 'tenant_signature_name', type: 'varchar', length: 200, nullable: true })
  tenantSignatureName: string | null;

  @Column({ name: 'tenant_signed_at', type: 'timestamptz', nullable: true })
  tenantSignedAt: Date | null;

  @Column({ name: 'manager_signature_name', type: 'varchar', length: 200, nullable: true })
  managerSignatureName: string | null;

  @Column({ name: 'manager_signed_at', type: 'timestamptz', nullable: true })
  managerSignedAt: Date | null;

  @Column({ name: 'terminated_at', type: 'timestamptz', nullable: true })
  terminatedAt: Date | null;

  @Column({ name: 'termination_reason', type: 'text', nullable: true })
  terminationReason: string | null;

  /** Prior lease this renewal supersedes when activated. */
  @Column({ name: 'parent_lease_id', type: 'uuid', nullable: true })
  parentLeaseId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
