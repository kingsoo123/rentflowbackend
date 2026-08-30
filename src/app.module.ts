import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration, createTypeOrmOptions, validateEnv } from './config';
import { AdminModule } from './admin/admin.module';
import { AdminRealtimeModule } from './admin/admin-realtime.module';
import { ArtisansModule } from './artisans/artisans.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { InspectionsModule } from './inspections/inspections.module';
import { LeasesModule } from './leases/leases.module';
import { ManagersModule } from './managers/managers.module';
import { LeaseFormsModule } from './lease-forms/lease-forms.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { TenantAssistantModule } from './tenant-assistant/tenant-assistant.module';
import { TenantNotificationsModule } from './tenant-notifications/tenant-notifications.module';
import { ServiceChargesModule } from './service-charges/service-charges.module';
import { DevicePushTokensModule } from './device-push-tokens/device-push-tokens.module';
import { FirebaseModule } from './firebase/firebase.module';
import { PaymentConfirmationsModule } from './payment-confirmations/payment-confirmations.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { SecuredUploadsModule } from './uploads/secured-uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
      load: [configuration],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTypeOrmOptions(configService),
    }),
    HealthModule,
    AuthModule,
    AdminRealtimeModule,
    AdminModule,
    ArtisansModule,
    ManagersModule,
    MaintenanceModule,
    LeaseFormsModule,
    TenantAssistantModule,
    TenantNotificationsModule,
    ServiceChargesModule,
    DevicePushTokensModule,
    FirebaseModule,
    PaymentConfirmationsModule,
    DirectMessagesModule,
    InspectionsModule,
    LeasesModule,
    SecuredUploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
