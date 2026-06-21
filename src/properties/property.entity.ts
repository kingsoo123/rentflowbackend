import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manager_user_id' })
  manager: User;

  /** Display name as entered (trimmed). Uniqueness per manager is enforced on `lower(trim(name))` in the DB. */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'address_line', type: 'text', nullable: true })
  addressLine: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ name: 'state_region', type: 'varchar', length: 120, nullable: true })
  stateRegion: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 32, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Column({ name: 'collection_bank_name', type: 'varchar', length: 120, nullable: true })
  collectionBankName: string | null;

  @Column({ name: 'collection_account_name', type: 'varchar', length: 200, nullable: true })
  collectionAccountName: string | null;

  @Column({ name: 'collection_account_number', type: 'varchar', length: 64, nullable: true })
  collectionAccountNumber: string | null;

  @Column({ name: 'collection_payment_instructions', type: 'text', nullable: true })
  collectionPaymentInstructions: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
