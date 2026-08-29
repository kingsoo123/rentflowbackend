import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole } from './user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 32 })
  role: UserRole;

  @Column({ name: 'phone_country_code', type: 'varchar', length: 8, nullable: true })
  phoneCountryCode: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  /** Set when the user completes email OTP verification (self-signup). */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'email_otp_hash', type: 'varchar', length: 128, nullable: true, select: false })
  emailOtpHash: string | null;

  @Column({ name: 'email_otp_expires_at', type: 'timestamptz', nullable: true, select: false })
  emailOtpExpiresAt: Date | null;

  @Column({ name: 'email_otp_attempts', type: 'int', default: 0, select: false })
  emailOtpAttempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
