import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateArtisanDto } from '../auth/dto/create-artisan.dto';
import { sanitizeUserText, sanitizeUserTextRecord } from '../common/sanitize-user-text';
import { Property } from '../properties/property.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { ManagerArtisanRoster } from './manager-artisan-roster.entity';

export type ArtisanListItem = {
  id: string;
  fullName: string;
  email: string;
  tradeType: string | null;
  phone: string | null;
  propertiesAssigned: string | null;
};

function strFromProfile(
  profile: unknown,
  key: string,
): string | null {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return null;
  }
  const v = (profile as Record<string, unknown>)[key];
  if (v === undefined || v === null) {
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

@Injectable()
export class ManagersArtisansService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ManagerArtisanRoster)
    private readonly rosterRepository: Repository<ManagerArtisanRoster>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  async checkArtisanEmailRegistered(email: string): Promise<{
    existsAsArtisan: boolean;
    hasAccount: boolean;
  }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.usersRepository.findOne({
      where: { email: normalized },
    });
    if (!user) {
      return { existsAsArtisan: false, hasAccount: false };
    }
    return {
      hasAccount: true,
      existsAsArtisan: user.role === UserRole.ARTISAN,
    };
  }

  async listForManager(managerUserId: string): Promise<ArtisanListItem[]> {
    const rows = await this.rosterRepository.find({
      where: { managerUserId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    if (rows.length === 0) {
      return [];
    }
    const artisanIds = rows.map((r) => r.artisanUserId);
    const artisans = await this.usersRepository.find({
      where: { id: In(artisanIds) },
    });
    const byId = new Map(artisans.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = byId.get(r.artisanUserId);
      const profile = r.profileData;
      return {
        id: r.artisanUserId,
        fullName: u?.fullName ?? 'Unknown artisan',
        email: u?.email ?? '',
        tradeType: strFromProfile(profile, 'tradeType'),
        phone: strFromProfile(profile, 'phone'),
        propertiesAssigned: strFromProfile(profile, 'propertiesAssigned'),
      };
    });
  }

  /**
   * Ensures `profile.propertiesAssigned` references a property on this manager's portfolio
   * when provided (comma-separated names allowed).
   */
  async assertProfilePropertiesAllowed(
    managerUserId: string,
    profile?: Record<string, unknown>,
  ): Promise<void> {
    const raw = profile?.propertiesAssigned;
    if (raw === undefined || raw === null) {
      return;
    }
    const assigned = String(raw).trim();
    if (!assigned) {
      return;
    }
    const names = assigned
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      return;
    }
    const props = await this.propertyRepository.find({
      where: { managerUserId },
    });
    const allowed = new Set(props.map((p) => p.name.trim().toLowerCase()));
    for (const name of names) {
      if (!allowed.has(name.toLowerCase())) {
        throw new BadRequestException(
          `Property "${name}" is not on your portfolio. Add it under Properties first or pick from the list.`,
        );
      }
    }
  }

  async addArtisanToRoster(
    managerUserId: string,
    dto: CreateArtisanDto,
  ): Promise<{ user: { id: string; email: string; fullName: string; role: string }; updated: boolean }> {
    const email = dto.email.trim().toLowerCase();
    const profileData = sanitizeUserTextRecord(
      dto.profile && typeof dto.profile === 'object' && !Array.isArray(dto.profile)
        ? dto.profile
        : {},
    );

    const artisan = await this.usersRepository.findOne({ where: { email } });
    if (!artisan) {
      throw new NotFoundException(
        'No account found with that email. The worker must sign up as an artisan first.',
      );
    }
    if (artisan.role !== UserRole.ARTISAN) {
      throw new ConflictException(
        'That email is not registered as a worker / artisan account.',
      );
    }

    const displayName = sanitizeUserText(dto.name);
    if (artisan.fullName !== displayName) {
      await this.usersRepository.update({ id: artisan.id }, { fullName: displayName });
    }

    const existing = await this.rosterRepository.findOne({
      where: { managerUserId, artisanUserId: artisan.id },
    });

    if (existing) {
      existing.profileData = profileData;
      await this.rosterRepository.save(existing);
      return {
        user: {
          id: artisan.id,
          email: artisan.email,
          fullName: displayName,
          role: artisan.role,
        },
        updated: true,
      };
    }

    const row = this.rosterRepository.create({
      managerUserId,
      artisanUserId: artisan.id,
      profileData,
    });
    await this.rosterRepository.save(row);

    return {
      user: {
        id: artisan.id,
        email: artisan.email,
        fullName: displayName,
        role: artisan.role,
      },
      updated: false,
    };
  }
}
