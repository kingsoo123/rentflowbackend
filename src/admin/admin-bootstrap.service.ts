import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_FULL_NAME,
  DEFAULT_ADMIN_PASSWORD,
} from './admin.constants';

/** Ensures the platform admin account exists (email + password from env / defaults). */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = (
      this.config.get<string>('ADMIN_EMAIL') ?? DEFAULT_ADMIN_EMAIL
    )
      .trim()
      .toLowerCase();
    const password =
      this.config.get<string>('ADMIN_PASSWORD') ?? DEFAULT_ADMIN_PASSWORD;
    const fullName =
      this.config.get<string>('ADMIN_FULL_NAME') ?? DEFAULT_ADMIN_FULL_NAME;

    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD missing — skip bootstrap');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await this.usersRepository
      .createQueryBuilder('u')
      .where('u.email = :email', { email })
      .addSelect('u.passwordHash')
      .getOne();

    if (!existing) {
      await this.usersRepository.save(
        this.usersRepository.create({
          email,
          fullName,
          role: UserRole.ADMIN,
          passwordHash,
          emailVerifiedAt: new Date(),
          emailOtpHash: null,
          emailOtpExpiresAt: null,
          emailOtpAttempts: 0,
          phoneCountryCode: null,
          phoneNumber: null,
        }),
      );
      this.logger.log(`Platform admin created: ${email}`);
      return;
    }

    await this.usersRepository.update(
      { id: existing.id },
      {
        role: UserRole.ADMIN,
        fullName: existing.fullName?.trim() || fullName,
        passwordHash,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: 0,
      },
    );
    this.logger.log(`Platform admin ensured: ${email}`);
  }
}
