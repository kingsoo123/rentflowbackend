import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('tenant_notifications')
export class TenantNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: User;

  /** e.g. `rent_renewal` */
  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ type: 'varchar', length: 280 })
  headline: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  /** Proposed monthly rent as entered on the manager renewal form (optional). */
  @Column({
    name: 'renewal_monthly_rent_display',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  renewalMonthlyRentDisplay: string | null;

  /** Lease end / renewal anchor date from the manager form (optional, YYYY-MM-DD). */
  @Column({ name: 'renewal_effective_date', type: 'date', nullable: true })
  renewalEffectiveDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
