import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import type { FlutterwaveV3WebhookPayload } from '../flutterwave/flutterwave-standard.types';
import { CreatePricingCheckoutDto } from './dto/create-pricing-checkout.dto';
import { PricingCheckoutService } from './pricing-checkout.service';
import { PRICING_PLANS } from './pricing-plans';

@Controller('pricing')
export class PricingCheckoutController {
  constructor(private readonly pricingCheckout: PricingCheckoutService) {}

  /** Public plan catalog for the marketing site. */
  @Get('plans')
  listPlans() {
    return Object.values(PRICING_PLANS).map((plan) => ({
      id: plan.id,
      name: plan.name,
      amountNgn: plan.amountNgn,
      currency: 'NGN',
      description: plan.description,
    }));
  }

  @Post('checkout')
  createCheckout(@Body() dto: CreatePricingCheckoutDto) {
    return this.pricingCheckout.createCheckout(dto);
  }

  @Get('checkout/status')
  getCheckoutStatus(
    @Query('tx_ref') txRef: string,
    @Query('status') redirectStatus?: string,
  ) {
    return this.pricingCheckout.getStatusByTxRef(txRef ?? '', redirectStatus);
  }

  @Post('webhooks/flutterwave')
  async handleFlutterwaveWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: FlutterwaveV3WebhookPayload,
  ) {
    this.pricingCheckout.verifyWebhookSignature(headers);
    await this.pricingCheckout.handleWebhook(body);
    return { received: true };
  }
}
