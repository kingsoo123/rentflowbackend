import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminRealtimeModule } from '../admin/admin-realtime.module';
import { EmailModule } from '../email/email.module';
import { Property } from '../properties/property.entity';
import { PropertyUnit } from '../properties/property-unit.entity';
import { PricingCheckout } from '../pricing/pricing-checkout.entity';
import { TenantProfile } from '../users/tenant-profile.entity';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PropertyManagerSubscriptionService } from './property-manager-subscription.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => AdminRealtimeModule),
    TypeOrmModule.forFeature([User, TenantProfile, Property, PropertyUnit, PricingCheckout]),
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
  providers: [
    AuthService,
    LoginRateLimitService,
    PropertyManagerSubscriptionService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard, PropertyManagerSubscriptionService],
})
export class AuthModule {}
