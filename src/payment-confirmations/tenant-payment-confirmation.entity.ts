import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Property } from '../properties/property.entity';
import { User } from '../users/user.entity';
import { PaymentConfirmationStatus } from './payment-confirmation-status.enum';
import { PaymentType } from './payment-type.enum';

@Entity('tenant_payment_confirmations')
export class TenantPaymentConfirmation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: User;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manager_user_id' })
  manager: User;

  @Column({ name: 'property_id', type: 'uuid', nullable: true })
  propertyId: string | null;

  @ManyToOne(() => Property, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'property_id' })
  property: Property | null;

  @Column({ name: 'payment_type', type: 'varchar', length: 32 })
  paymentType: PaymentType;

  @Column({ name: 'amount_display', type: 'varchar', length: 64, nullable: true })
  amountDisplay: string | null;

  @Column({ name: 'receipt_image_path', type: 'varchar', length: 512 })
  receiptImagePath: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: PaymentConfirmationStatus.PENDING,
  })
  status: PaymentConfirmationStatus;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
