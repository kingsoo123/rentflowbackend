import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { JwtAccessPayload } from './types/jwt-payload';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { sanitizeUserText, sanitizeUserTextRecord } from '../common/sanitize-user-text';
import { LoginRateLimitService } from './login-rate-limit.service';

export type SignupResult = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: Date;
};

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
  ) {}

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

    const propertyNameList =
      dto.role === UserRole.PROPERTY_MANAGER
        ? this.parseCommaSeparatedPropertyNames(dto.propertyNames)
        : [];

    if (dto.role === UserRole.PROPERTY_MANAGER && propertyNameList.length === 0) {
      throw new BadRequestException(
        'Enter at least one property name. Separate multiple properties with commas.',
      );
    }

    return this.dataSource.transaction(async (em) => {
      const user = await this.persistNewUserWithManager(em, {
        email: dto.email,
        fullName: sanitizeUserText(dto.name),
        passwordPlain: dto.password,
        role: dto.role,
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
    });
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
    logContext: string;
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

  private async persistNewUserWithManager(
    em: EntityManager,
    params: {
      email: string;
      fullName: string;
      passwordPlain: string;
      role: UserRole;
      logContext: string;
    },
  ): Promise<SignupResult> {
    const usersRepository = em.getRepository(User);
    try {
      const existing = await usersRepository.exist({
        where: { email: params.email },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(params.passwordPlain, saltRounds);

      const user = usersRepository.create({
        email: params.email,
        passwordHash,
        fullName: params.fullName,
        role: params.role,
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
            'An account with this email already exists',
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
}
