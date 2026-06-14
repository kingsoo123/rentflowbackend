import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tenant_lease_form_submissions')
export class TenantLeaseFormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'form_slug', type: 'varchar', length: 80 })
  formSlug: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  answers: Record<string, string>;

  @Column({ name: 'signature_text', type: 'varchar', length: 500 })
  signatureText: string;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;
}
