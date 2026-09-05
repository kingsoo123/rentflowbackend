import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingCheckout } from '../pricing/pricing-checkout.entity';
import { PricingCheckoutStatus } from '../pricing/pricing-checkout-status.enum';

@Injectable()
export class PropertyManagerSubscriptionService {
  constructor(
    @InjectRepository(PricingCheckout)
    private readonly checkoutsRepository: Repository<PricingCheckout>,
  ) {}

  async hasSuccessfulCheckoutForEmail(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return this.checkoutsRepository.exist({
      where: {
        customerEmail: normalized,
        status: PricingCheckoutStatus.SUCCESSFUL,
      },
    });
  }

  assertPropertyManagerHasPaid(email: string): Promise<void> {
    return this.hasSuccessfulCheckoutForEmail(email).then((paid) => {
      if (!paid) {
        throw new ForbiddenException({
          message:
            'An active subscription is required for property managers. Complete checkout on the pricing page first, using the same email as your account.',
          code: 'SUBSCRIPTION_REQUIRED',
          email: email.trim().toLowerCase(),
        });
      }
    });
  }
}
