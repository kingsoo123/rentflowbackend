import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { CreatePropertyDto } from './dto/create-property.dto';
import type { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from '../properties/property.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

export type ManagerPropertyDetail = {
  id: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  createdAt: string;
};

export type ManagerPortfolioSummary = {
  accountName: string;
  propertyCount: number;
};

function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    const d = err.driverError as { code?: string } | undefined;
    return d?.code;
  }
  return undefined;
}

function emptyToNull(s: string | undefined): string | null {
  if (s === undefined || s === null) {
    return null;
  }
  const t = String(s).trim();
  return t === '' ? null : t;
}

@Injectable()
export class ManagersPortfolioService {
  private readonly logger = new Logger(ManagersPortfolioService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
  ) {}

  private async assertPropertyManager(managerUserId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: managerUserId, role: UserRole.PROPERTY_MANAGER },
    });
    if (!user) {
      throw new NotFoundException('Manager not found');
    }
    return user;
  }

  private mapProperty(p: Property): ManagerPropertyDetail {
    return {
      id: p.id,
      name: p.name,
      addressLine: p.addressLine,
      city: p.city,
      stateRegion: p.stateRegion,
      postalCode: p.postalCode,
      country: p.country,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async getPortfolioSummary(managerUserId: string): Promise<ManagerPortfolioSummary> {
    const user = await this.assertPropertyManager(managerUserId);
    const propertyCount = await this.propertyRepository.count({
      where: { managerUserId },
    });
    return {
      accountName: user.fullName,
      propertyCount,
    };
  }

  async listPropertiesForManager(
    managerUserId: string,
  ): Promise<ManagerPropertyDetail[]> {
    await this.assertPropertyManager(managerUserId);
    const rows = await this.propertyRepository.find({
      where: { managerUserId },
      order: { name: 'ASC' },
    });
    return rows.map((r) => this.mapProperty(r));
  }

  async createProperty(
    managerUserId: string,
    dto: CreatePropertyDto,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    const row = this.propertyRepository.create({
      managerUserId,
      name: dto.name.trim(),
      addressLine: emptyToNull(dto.addressLine),
      city: emptyToNull(dto.city),
      stateRegion: emptyToNull(dto.stateRegion),
      postalCode: emptyToNull(dto.postalCode),
      country: emptyToNull(dto.country),
    });
    try {
      const saved = await this.propertyRepository.save(row);
      return this.mapProperty(saved);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        if (code === '23505') {
          throw new ConflictException(
            'A property with this name already exists in your portfolio (case-insensitive).',
          );
        }
        this.logger.warn(`createProperty DB error [${code ?? 'unknown'}]: ${err.message}`);
      }
      this.logger.error(
        'createProperty failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not create property.');
    }
  }

  async updateProperty(
    managerUserId: string,
    propertyId: string,
    dto: UpdatePropertyDto,
  ): Promise<ManagerPropertyDetail> {
    await this.assertPropertyManager(managerUserId);
    const row = await this.propertyRepository.findOne({
      where: { id: propertyId, managerUserId },
    });
    if (!row) {
      throw new NotFoundException('Property not found');
    }
    const hasAny =
      dto.name !== undefined ||
      dto.addressLine !== undefined ||
      dto.city !== undefined ||
      dto.stateRegion !== undefined ||
      dto.postalCode !== undefined ||
      dto.country !== undefined;
    if (!hasAny) {
      throw new BadRequestException('No updates provided');
    }
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.addressLine !== undefined) {
      row.addressLine = emptyToNull(dto.addressLine);
    }
    if (dto.city !== undefined) {
      row.city = emptyToNull(dto.city);
    }
    if (dto.stateRegion !== undefined) {
      row.stateRegion = emptyToNull(dto.stateRegion);
    }
    if (dto.postalCode !== undefined) {
      row.postalCode = emptyToNull(dto.postalCode);
    }
    if (dto.country !== undefined) {
      row.country = emptyToNull(dto.country);
    }
    try {
      const saved = await this.propertyRepository.save(row);
      return this.mapProperty(saved);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const code = pgErrorCode(err);
        if (code === '23505') {
          throw new ConflictException(
            'A property with this name already exists in your portfolio (case-insensitive).',
          );
        }
        this.logger.warn(`updateProperty DB error [${code ?? 'unknown'}]: ${err.message}`);
      }
      this.logger.error(
        'updateProperty failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Could not update property.');
    }
  }

  async deleteProperty(managerUserId: string, propertyId: string): Promise<void> {
    await this.assertPropertyManager(managerUserId);
    const res = await this.propertyRepository.delete({
      id: propertyId,
      managerUserId,
    });
    if (!res.affected) {
      throw new NotFoundException('Property not found');
    }
  }
}
