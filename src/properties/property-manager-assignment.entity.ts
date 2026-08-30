import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Property } from './property.entity';

/** Co-managers assigned to a property (in addition to the primary `manager_user_id`). */
@Entity('property_manager_assignments')
@Unique('UQ_property_manager_assignment', ['propertyId', 'managerUserId'])
export class PropertyManagerAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'property_id', type: 'uuid' })
  propertyId: string;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manager_user_id' })
  manager: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
