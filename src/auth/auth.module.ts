import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from '../properties/property.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TenantProfile, Property]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV', 'development');
        const secret = (config.get<string>('JWT_SECRET') ?? '').trim();
        if ((!secret || secret.length < 16) && nodeEnv === 'production') {
          throw new Error(
            'JWT_SECRET must be set to at least 16 characters in production',
          );
        }
        return {
          secret:
            secret.length >= 16
              ? secret
              : 'dev-only-insecure-secret-min16chars',
          signOptions: {
            issuer: 'real_estate_backend',
            audience: 'rent_pilot',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
