import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlutterwaveStandardService } from '../flutterwave/flutterwave-standard.service';
import { AdminRealtimeModule } from '../admin/admin-realtime.module';
import { PricingCheckout } from './pricing-checkout.entity';
import { PricingCheckoutController } from './pricing-checkout.controller';
import { PricingCheckoutService } from './pricing-checkout.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PricingCheckout]),
    AdminRealtimeModule,
  ],
  controllers: [PricingCheckoutController],
  providers: [PricingCheckoutService, FlutterwaveStandardService],
  exports: [PricingCheckoutService, TypeOrmModule],
})
export class PricingModule {}
