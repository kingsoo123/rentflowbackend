import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AdminRealtimeService } from '../admin/admin-realtime.service';
import { DEFAULT_ADMIN_EMAIL } from '../admin/admin.constants';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { sanitizeUserText, sanitizeUserTextRecord } from '../common/sanitize-user-text';
import { normalizeSignupPhone } from '../common/phone-signup';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { JwtAccessPayload } from './types/jwt-payload';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PropertyManagerSubscriptionService } from './property-manager-subscription.service';
import { ZeptoMailService } from '../email/zeptomail.service';
import type { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import type { ResendEmailOtpDto } from './dto/resend-email-otp.dto';

export type SignupResult = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: Date;
  /** Present after self-service signup — client must verify OTP before login. */
  requiresEmailVerification?: boolean;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
};

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TenantProfile)
    private readonly tenantProfileRepository: Repository<TenantProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly loginRateLimit: LoginRateLimitService,
    private readonly zeptoMail: ZeptoMailService,
    private readonly config: ConfigService,
    private readonly managerSubscription: PropertyManagerSubscriptionService,
    @Optional()
    @Inject(forwardRef(() => AdminRealtimeService))
    private readonly adminRealtime?: AdminRealtimeService,
  ) {}

  private platformAdminEmail(): string {
    return (
      this.config.get<string>('ADMIN_EMAIL') ?? DEFAULT_ADMIN_EMAIL
    )
      .trim()
      .toLowerCase();
  }

  async login(dto: LoginDto, clientIp: string): Promise<LoginResult> {
    this.loginRateLimit.assertCanAttempt(dto.email, clientIp);

    const remember = dto.remember === true;
    const expiresIn = remember ? '30d' : '1d';

    const user = await this.usersRepository
      .createQueryBuilder('u')
      .where('u.email = :email', { email: dto.email })
      .addSelect('u.passwordHash')
      .getOne();

    if (!user) {
      this.loginRateLimit.rejectFailedAttempt(dto.email, clientIp);
    }

    const passwordOk = await bcrypt
      .compare(dto.password, user.passwordHash)
      .catch(() => false);
    if (!passwordOk) {
      this.loginRateLimit.rejectFailedAttempt(dto.email, clientIp);
    }

    if (user.role !== UserRole.ADMIN && !user.emailVerifiedAt) {
      throw new ForbiddenException({
        message:
          'Please verify your email with the OTP we sent before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    if (user.role === UserRole.PROPERTY_MANAGER) {
      await this.managerSubscription.assertPropertyManagerHasPaid(user.email);
    }

    this.loginRateLimit.recordSuccess(dto.email, clientIp);

    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async signup(dto: SignupDto): Promise<SignupResult> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be created via self-service signup.',
      );
    }

    if (dto.email.trim().toLowerCase() === this.platformAdminEmail()) {
      throw new ForbiddenException(
        'This email address is reserved for the platform admin.',
      );
    }

    const propertyNameList =
      dto.role === UserRole.PROPERTY_MANAGER
        ? this.parseCommaSeparatedPropertyNames(dto.propertyNames)
        : [];

    if (dto.role === UserRole.PROPERTY_MANAGER && propertyNameList.length === 0) {
      throw new BadRequestException(
        'Enter at least one property name. Separate multiple properties with commas.',
      );
    }

    if (dto.role === UserRole.PROPERTY_MANAGER) {
      await this.managerSubscription.assertPropertyManagerHasPaid(dto.email);
    }

    const phone = normalizeSignupPhone(dto.phoneCountryCode, dto.phoneNumber);

    return this.dataSource.transaction(async (em) => {
      const user = await this.persistNewUserWithManager(em, {
        email: dto.email,
        fullName: sanitizeUserText(dto.name),
        passwordPlain: dto.password,
        role: dto.role,
        phoneCountryCode: phone.phoneCountryCode,
        phoneNumber: phone.phoneNumber,
        logContext: 'signup',
      });

      if (propertyNameList.length > 0) {
        const propRepo = em.getRepository(Property);
        const rows = propertyNameList.map((name) =>
          propRepo.create({
            managerUserId: user.id,
            name,
          }),
        );
        try {
          await propRepo.save(rows);
        } catch (err) {
          if (err instanceof QueryFailedError) {
            const code = pgErrorCode(err);
            this.logger.warn(
              `signup properties DB error [${code ?? 'unknown'}]: ${err.message}`,
            );
            if (code === '23505') {
              throw new ConflictException(
                'A property with one of these names already exists for this account.',
              );
            }
            if (
              code === '42P01' ||
              (err.message.includes('relation') &&
                err.message.includes('does not exist'))
            ) {
              throw new ServiceUnavailableException(
                'Database is missing the properties table. From real_estate_backend run: npm run typeorm:migration:run',
              );
            }
          }
          throw err;
        }
      }

      return user;
    }).then(async (user) => {
      this.emitAccountCreated({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneCountryCode: null,
        phoneNumber: null,
        emailVerifiedAt: null,
        createdAt: user.createdAt,
      });
      await this.issueAndSendEmailOtp(user.id, user.email, user.fullName);
      return {
        ...user,
        requiresEmailVerification: true,
      };
    });
  }

  async verifyEmailOtp(dto: VerifyEmailOtpDto): Promise<{ verified: true; email: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepository
      .createQueryBuilder('u')
      .where('u.email = :email', { email })
      .addSelect(['u.emailOtpHash', 'u.emailOtpExpiresAt', 'u.emailOtpAttempts'])
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid verification code');
    }
    if (user.emailVerifiedAt) {
      return { verified: true, email: user.email };
    }

    const code = dto.code.trim();
    const demoOtp = this.demoOtpCode();
    const demoMatch = Boolean(demoOtp && code === demoOtp);

    if (!demoMatch) {
      if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
        throw new BadRequestException(
          'No active verification code. Request a new code.',
        );
      }
      if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
        throw new BadRequestException(
          'Too many incorrect attempts. Request a new verification code.',
        );
      }
      if (user.emailOtpExpiresAt.getTime() < Date.now()) {
        throw new BadRequestException(
          'This verification code has expired. Request a new one.',
        );
      }

      const incomingHash = this.hashOtp(code);
      if (incomingHash !== user.emailOtpHash) {
        await this.usersRepository.update(
          { id: user.id },
          { emailOtpAttempts: user.emailOtpAttempts + 1 },
        );
        throw new BadRequestException('Invalid verification code');
      }
    }

    await this.usersRepository.update(
      { id: user.id },
      {
        emailVerifiedAt: new Date(),
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: 0,
      },
    );

    return { verified: true, email: user.email };
  }

  async getSubscriptionStatus(user: JwtAccessPayload): Promise<{
    subscribed: boolean;
    role: string;
  }> {
    if (user.role !== UserRole.PROPERTY_MANAGER) {
      return { subscribed: true, role: user.role };
    }
    const subscribed =
      await this.managerSubscription.hasSuccessfulCheckoutForEmail(user.email);
    return { subscribed, role: user.role };
  }

  async resendEmailOtp(dto: ResendEmailOtpDto): Promise<{ sent: true; email: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      // Avoid account enumeration
      return { sent: true, email };
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('This email is already verified. You can sign in.');
    }
    await this.issueAndSendEmailOtp(user.id, user.email, user.fullName);
    return { sent: true, email: user.email };
  }

  /**
   * Creates a tenant user, or updates name + profile if the email already belongs to a tenant.
   * Does not change `password_hash` on update (avoids wiping credentials).
   */
  async createTenantByManager(
    dto: CreateTenantDto,
  ): Promise<{ user: SignupResult; updated: boolean }> {
    const profileData = sanitizeUserTextRecord(
      dto.profile && typeof dto.profile === 'object' && !Array.isArray(dto.profile)
        ? dto.profile
        : {},
    );

    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      if (existing.role !== UserRole.TENANT) {
        throw new ConflictException(
          'An account with this email already exists with a different role',
        );
      }

      await this.usersRepository.update(
        { id: existing.id },
        { fullName: sanitizeUserText(dto.name) },
      );

      try {
        await this.upsertTenantProfile(existing.id, profileData);
      } catch (err) {
        this.rethrowTenantProfileSaveError(err, 'createTenantByManager(update)');
      }

      return {
        user: {
          id: existing.id,
          email: existing.email,
          fullName: sanitizeUserText(dto.name),
          role: existing.role,
          createdAt: existing.createdAt,
        },
        updated: true,
      };
    }

    const provisioningPassword = this.generateSecureProvisioningPassword();
    const created = await this.persistNewUser({
      email: dto.email,
      fullName: sanitizeUserText(dto.name),
      passwordPlain: provisioningPassword,
      role: UserRole.TENANT,
      logContext: 'createTenantByManager',
      emailVerifiedAt: new Date(),
    });

    try {
      await this.upsertTenantProfile(created.id, profileData);
    } catch (err) {
      try {
        await this.usersRepository.delete({ id: created.id });
      } catch (delErr) {
        this.logger.error(
          `Failed to roll back user ${created.id} after tenant_profiles save error`,
          delErr instanceof Error ? delErr.stack : String(delErr),
        );
      }
      this.rethrowTenantProfileSaveError(err, 'createTenantByManager(create)');
    }

    this.emitAccountCreated({
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      role: created.role,
      phoneCountryCode: null,
      phoneNumber: null,
      emailVerifiedAt: new Date().toISOString(),
      createdAt: created.createdAt,
    });

    return { user: created, updated: false };
  }

  private async upsertTenantProfile(
    userId: string,
    profileData: Record<string, unknown>,
  ): Promise<void> {
    const safeProfile = sanitizeUserTextRecord(profileData);
    const row = await this.tenantProfileRepository.findOne({
      where: { userId },
    });
    if (row) {
      row.profileData = safeProfile;
      await this.tenantProfileRepository.save(row);
      return;
    }
    await this.tenantProfileRepository.save(
      this.tenantProfileRepository.create({
        userId,
        profileData: safeProfile,
      }),
    );
  }

  private rethrowTenantProfileSaveError(err: unknown, context: string): void {
    if (err instanceof QueryFailedError) {
      const code = pgErrorCode(err);
      this.logger.warn(`${context} tenant_profiles DB error [${code ?? 'unknown'}]: ${err.message}`);
      if (
        code === '42P01' ||
        (err.message.includes('relation') && err.message.includes('does not exist'))
      ) {
        throw new ServiceUnavailableException(
          'Database is missing the tenant_profiles table. From real_estate_backend run: npm run typeorm:migration:run',
        );
      }
    }

    this.logger.error(
      `${context}: tenant_profiles save failed`,
      err instanceof Error ? err.stack : String(err),
    );
    throw new InternalServerErrorException(
      'Could not save tenant profile. Check API logs and DATABASE_URL.',
    );
  }

  /** Internal-only password so `password_hash` is populated; not returned to clients. */
  private generateSecureProvisioningPassword(): string {
    return randomBytes(18).toString('base64url');
  }

  private async persistNewUser(params: {
    email: string;
    fullName: string;
    passwordPlain: string;
    role: UserRole;
    phoneCountryCode?: string | null;
    phoneNumber?: string | null;
    logContext: string;
    emailVerifiedAt?: Date | null;
  }): Promise<SignupResult> {
    return this.persistNewUserWithManager(this.usersRepository.manager, params);
  }

  /**
   * Splits comma-separated property names, trims, drops empties, dedupes by
   * case-insensitive key, enforces max length per name.
   */
  private parseCommaSeparatedPropertyNames(raw: string | undefined): string[] {
    if (raw === undefined || raw === null) {
      return [];
    }
    const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!s) {
      return [];
    }
    const seen = new Map<string, string>();
    for (const part of s.split(',')) {
      const t = part.trim();
      if (!t) {
        continue;
      }
      if (t.length > 200) {
        throw new BadRequestException(
          `Each property name must be at most 200 characters (check "${t.slice(0, 48)}${t.length > 48 ? '…' : ''}").`,
        );
      }
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, t);
      }
    }
    return [...seen.values()];
  }

  /** When set (e.g. AUTH_DEMO_OTP=111111), that code is issued and always accepted. */
  private demoOtpCode(): string | null {
    const raw = this.config.get<string>('AUTH_DEMO_OTP')?.trim();
    if (!raw || !/^\d{6}$/.test(raw)) {
      return null;
    }
    return raw;
  }

  private generateOtpCode(): string {
    const demo = this.demoOtpCode();
    if (demo) {
      return demo;
    }
    const max = 10 ** OTP_LENGTH;
    return String(randomInt(0, max)).padStart(OTP_LENGTH, '0');
  }

  private hashOtp(code: string): string {
    return createHash('sha256').update(code.trim()).digest('hex');
  }

  private async issueAndSendEmailOtp(
    userId: string,
    email: string,
    fullName: string,
  ): Promise<void> {
    const demo = this.demoOtpCode();
    if (!demo && !this.zeptoMail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email verification is temporarily unavailable (ZEPTOMAIL_TOKEN not configured).',
      );
    }

    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.usersRepository.update(
      { id: userId },
      {
        emailOtpHash: this.hashOtp(code),
        emailOtpExpiresAt: expiresAt,
        emailOtpAttempts: 0,
      },
    );

    if (demo) {
      this.logger.warn(
        `AUTH_DEMO_OTP active — verification code for ${email} is ${demo} (email send optional)`,
      );
    }

    if (!this.zeptoMail.isConfigured()) {
      return;
    }

    const send = await this.zeptoMail.sendSignupOtp({
      to: email,
      fullName,
      otp: code,
      expiresMinutes: Math.round(OTP_TTL_MS / 60000),
    });
    if (!send.ok) {
      this.logger.error(`Failed to send signup OTP to ${email}: ${send.message}`);
      if (demo) {
        // Demo can proceed with AUTH_DEMO_OTP even when ZeptoMail quota is exhausted.
        return;
      }
      throw new ServiceUnavailableException(
        'We could not send the verification email. Please try again in a moment.',
      );
    }
  }

  private async persistNewUserWithManager(
    em: EntityManager,
    params: {
      email: string;
      fullName: string;
      passwordPlain: string;
      role: UserRole;
      phoneCountryCode?: string | null;
      phoneNumber?: string | null;
      logContext: string;
      emailVerifiedAt?: Date | null;
    },
  ): Promise<SignupResult> {
    const usersRepository = em.getRepository(User);
    try {
      const existing = await usersRepository.exist({
        where: { email: params.email },
      });
      if (existing) {
        throw new ConflictException(
          'An account with this email already exists. Sign in instead — removing a tenant from a property does not delete their login.',
        );
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(params.passwordPlain, saltRounds);

      const user = usersRepository.create({
        email: params.email,
        passwordHash,
        fullName: params.fullName,
        role: params.role,
        phoneCountryCode: params.phoneCountryCode ?? null,
        phoneNumber: params.phoneNumber ?? null,
        emailVerifiedAt: params.emailVerifiedAt ?? null,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: 0,
      });
      await usersRepository.save(user);

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }

      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        this.logger.warn(
          `${params.logContext} DB error [${code ?? 'unknown'}]: ${err.message}`,
        );
        if (code === '23505') {
          throw new ConflictException(
            'An account with this email already exists. Sign in instead — removing a tenant from a property does not delete their login.',
          );
        }
        if (
          code === '42P01' ||
          (err.message.includes('relation') &&
            err.message.includes('does not exist'))
        ) {
          throw new ServiceUnavailableException(
            'Database is missing the users table. From real_estate_backend run: npm run typeorm:migration:run',
          );
        }
      }

      this.logger.error(
        `${params.logContext} failed`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Could not save the user. Check API logs and DATABASE_URL.',
      );
    }
  }

  private emitAccountCreated(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    phoneCountryCode?: string | null;
    phoneNumber?: string | null;
    emailVerifiedAt?: Date | string | null;
    createdAt: Date | string;
  }): void {
    try {
      const verified =
        user.emailVerifiedAt instanceof Date
          ? user.emailVerifiedAt.toISOString()
          : typeof user.emailVerifiedAt === 'string'
            ? user.emailVerifiedAt
            : null;
      const createdAt =
        user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : new Date(user.createdAt).toISOString();
      this.adminRealtime?.notifyAccountCreated({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneCountryCode: user.phoneCountryCode ?? null,
        phoneNumber: user.phoneNumber ?? null,
        emailVerifiedAt: verified,
        createdAt,
      });
    } catch (err) {
      this.logger.warn(
        `admin realtime notify failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
