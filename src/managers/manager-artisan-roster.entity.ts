import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/** Links an artisan user to a property manager's roster with onboarding profile JSON. */
@Entity('manager_artisan_roster')
@Unique(['managerUserId', 'artisanUserId'])
export class ManagerArtisanRoster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'profile_data', type: 'jsonb', default: () => "'{}'::jsonb" })
  profileData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
