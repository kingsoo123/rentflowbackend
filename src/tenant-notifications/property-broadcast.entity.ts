import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('property_broadcasts')
export class PropertyBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'manager_id', type: 'uuid' })
  managerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @Column({ type: 'varchar', length: 280 })
  headline: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'tenant_count', type: 'int' })
  tenantCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
