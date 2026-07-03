import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { MaintenanceRequest } from './maintenance-request.entity';
import { MaintenanceAssignmentStatus } from './maintenance-assignment-status.enum';

@Entity('maintenance_assignments')
export class MaintenanceAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'maintenance_request_id', type: 'uuid' })
  maintenanceRequestId: string;

  @ManyToOne(() => MaintenanceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'maintenance_request_id' })
  maintenanceRequest: MaintenanceRequest;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manager_user_id' })
  manager: User;

  @Column({ name: 'artisan_user_id', type: 'uuid' })
  artisanUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'artisan_user_id' })
  artisan: User;

  @Column({ type: 'varchar', length: 32 })
  status: MaintenanceAssignmentStatus;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @Column({ name: 'accept_by', type: 'timestamptz' })
  acceptBy: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
