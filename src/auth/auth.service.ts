import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { JwtAccessPayload } from './types/jwt-payload';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

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
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const remember = dto.remember === true;
    const expiresIn = remember ? '30d' : '1d';

    const user = await this.usersRepository
      .createQueryBuilder('u')
      .where('u.email = :email', { email: dto.email })
      .addSelect('u.passwordHash')
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await bcrypt
      .compare(dto.password, user.passwordHash)
      .catch(() => false);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

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

    return this.persistNewUser({
      email: dto.email,
      fullName: dto.name.trim(),
      passwordPlain: dto.password,
      role: dto.role,
      logContext: 'signup',
    });
  }

  /**
   * Creates a tenant user, or updates name + profile if the email already belongs to a tenant.
   * Does not change `password_hash` on update (avoids wiping credentials).
   */
  async createTenantByManager(
    dto: CreateTenantDto,
  ): Promise<{ user: SignupResult; updated: boolean }> {
    const profileData =
      dto.profile && typeof dto.profile === 'object' && !Array.isArray(dto.profile)
        ? dto.profile
        : {};

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
        { fullName: dto.name.trim() },
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
          fullName: dto.name.trim(),
          role: existing.role,
          createdAt: existing.createdAt,
        },
        updated: true,
      };
    }

    const provisioningPassword = this.generateSecureProvisioningPassword();
    const created = await this.persistNewUser({
      email: dto.email,
      fullName: dto.name.trim(),
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
    const row = await this.tenantProfileRepository.findOne({
      where: { userId },
    });
    if (row) {
      row.profileData = profileData;
      await this.tenantProfileRepository.save(row);
      return;
    }
    await this.tenantProfileRepository.save(
      this.tenantProfileRepository.create({
        userId,
        profileData,
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
    try {
      const existing = await this.usersRepository.exist({
        where: { email: params.email },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(params.passwordPlain, saltRounds);

      const user = this.usersRepository.create({
        email: params.email,
        passwordHash,
        fullName: params.fullName,
        role: params.role,
      });
      await this.usersRepository.save(user);

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
