import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RegisterDevicePushTokenDto } from './dto/register-device-push-token.dto';
import { UserDevicePushToken } from './user-device-push-token.entity';

@Injectable()
export class DevicePushTokensService {
  constructor(
    @InjectRepository(UserDevicePushToken)
    private readonly tokenRepository: Repository<UserDevicePushToken>,
  ) {}

  /** Android FCM registration tokens for these users (empty `userIds` → no query). */
  async findAndroidTokensByUserIds(userIds: string[]): Promise<UserDevicePushToken[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.tokenRepository.find({
      where: { userId: In(userIds), platform: 'android' },
    });
  }

  async deleteByUserIdAndToken(userId: string, token: string): Promise<void> {
    await this.tokenRepository.delete({ userId, token });
  }

  async upsertForUser(userId: string, dto: RegisterDevicePushTokenDto): Promise<void> {
    const existing = await this.tokenRepository.findOne({
      where: { userId, token: dto.token },
    });
    if (existing) {
      existing.platform = dto.platform;
      await this.tokenRepository.save(existing);
      return;
    }
    const row = this.tokenRepository.create({
      userId,
      token: dto.token,
      platform: dto.platform,
    });
    await this.tokenRepository.save(row);
  }
}
