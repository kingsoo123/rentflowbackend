import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('manager_artisan_direct_message_threads')
@Index(['managerUserId', 'updatedAt'])
@Index(['artisanUserId', 'updatedAt'])
@Index(['managerUserId', 'artisanUserId'], { unique: true })
export class ManagerArtisanDirectMessageThread {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'manager_user_id', type: 'uuid' })
  managerUserId!: string;

  @Column({ name: 'artisan_user_id', type: 'uuid' })
  artisanUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
