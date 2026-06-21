import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('direct_message_threads')
@Index(['managerUserId', 'updatedAt'])
@Index(['tenantId', 'updatedAt'])
export class DirectMessageThread {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
