import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PricingCheckoutStatus } from './pricing-checkout-status.enum';
import type { PricingPlanId } from './pricing-plans';

@Entity('pricing_checkouts')
export class PricingCheckout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tx_ref', type: 'varchar', length: 128, unique: true })
  txRef: string;

  @Column({ name: 'plan_id', type: 'varchar', length: 32 })
  planId: PricingPlanId;

  @Column({ name: 'plan_name', type: 'varchar', length: 120 })
  planName: string;

  @Column({ name: 'amount_ngn', type: 'integer' })
  amountNgn: number;

  @Column({ type: 'varchar', length: 32, default: 'NGN' })
  currency: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 200 })
  customerName: string;

  @Column({ name: 'customer_email', type: 'varchar', length: 320 })
  customerEmail: string;

  @Column({ name: 'customer_phone', type: 'varchar', length: 32, nullable: true })
  customerPhone: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: PricingCheckoutStatus.PENDING,
  })
  status: PricingCheckoutStatus;

  @Column({ name: 'flutterwave_transaction_id', type: 'varchar', length: 64, nullable: true })
  flutterwaveTransactionId: string | null;

  @Column({ name: 'flutterwave_flw_ref', type: 'varchar', length: 128, nullable: true })
  flutterwaveFlwRef: string | null;

  @Column({ name: 'checkout_url', type: 'varchar', length: 512, nullable: true })
  checkoutUrl: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
