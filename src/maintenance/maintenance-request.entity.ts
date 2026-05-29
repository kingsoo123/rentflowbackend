import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MaintenanceRequestStatus } from './maintenance-request-status.enum';
import { MaintenanceUrgency } from './maintenance-urgency.enum';

@Entity('maintenance_requests')
export class MaintenanceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 32 })
  urgency: MaintenanceUrgency;

  @Column({ type: 'varchar', length: 32, default: MaintenanceRequestStatus.SUBMITTED })
  status: MaintenanceRequestStatus;

  @Column({ name: 'attachment_urls', type: 'jsonb', default: () => "'[]'::jsonb" })
  attachmentUrls: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
