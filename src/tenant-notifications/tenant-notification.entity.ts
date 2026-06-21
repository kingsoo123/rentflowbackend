import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { PropertyBroadcast } from './property-broadcast.entity';
import { TenantPaymentConfirmation } from '../payment-confirmations/tenant-payment-confirmation.entity';

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

  /** Set when this row was created from a portfolio-wide manager broadcast. */
  @Column({ name: 'broadcast_id', type: 'uuid', nullable: true })
  broadcastId: string | null;

  @ManyToOne(() => PropertyBroadcast, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'broadcast_id' })
  broadcast: PropertyBroadcast | null;

  /** Set when kind is `payment_received` — links to downloadable receipt PDF. */
  @Column({ name: 'payment_confirmation_id', type: 'uuid', nullable: true })
  paymentConfirmationId: string | null;

  @ManyToOne(() => TenantPaymentConfirmation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_confirmation_id' })
  paymentConfirmation: TenantPaymentConfirmation | null;
}
