import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('direct_messages')
@Index(['threadId', 'createdAt'])
export class DirectMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId!: string;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId!: string;

  @Column({ name: 'sender_role', type: 'varchar', length: 32 })
  senderRole!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
