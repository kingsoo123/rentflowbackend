import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingCheckout } from '../pricing/pricing-checkout.entity';
import { PricingCheckoutStatus } from '../pricing/pricing-checkout-status.enum';

export const SUBSCRIPTION_TERM_MONTHS = 1;
export const SUBSCRIPTION_EXPIRING_SOON_DAYS = 7;

export type SubscriptionAccessReason =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'never_subscribed';

export type ManagerSubscriptionState = {
  active: boolean;
  reason: SubscriptionAccessReason;
  expiresAt: Date | null;
  daysRemaining: number | null;
  expiringSoon: boolean;
};

@Injectable()
export class PropertyManagerSubscriptionService {
  constructor(
    @InjectRepository(PricingCheckout)
    private readonly checkoutsRepository: Repository<PricingCheckout>,
  ) {}

  async getSubscriptionStateForEmail(
    email: string,
  ): Promise<ManagerSubscriptionState> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return this.inactiveState('never_subscribed');
    }

    const latest = await this.checkoutsRepository.findOne({
      where: {
        customerEmail: normalized,
        status: PricingCheckoutStatus.SUCCESSFUL,
      },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
    });

    if (!latest) {
      return this.inactiveState('never_subscribed');
    }

    const anchor = latest.paidAt ?? latest.createdAt;
    const expiresAt = addCalendarMonths(anchor, SUBSCRIPTION_TERM_MONTHS);
    const now = Date.now();
    const msRemaining = expiresAt.getTime() - now;

    if (msRemaining <= 0) {
      return {
        active: false,
        reason: 'expired',
        expiresAt,
        daysRemaining: 0,
        expiringSoon: false,
      };
    }

    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    const expiringSoon = daysRemaining <= SUBSCRIPTION_EXPIRING_SOON_DAYS;

    return {
      active: true,
      reason: expiringSoon ? 'expiring_soon' : 'active',
      expiresAt,
      daysRemaining,
      expiringSoon,
    };
  }

  async hasSuccessfulCheckoutForEmail(email: string): Promise<boolean> {
    const state = await this.getSubscriptionStateForEmail(email);
    return state.active;
  }

  assertPropertyManagerHasPaid(email: string): Promise<void> {
    return this.getSubscriptionStateForEmail(email).then((state) => {
      if (state.active) {
        return;
      }

      const normalized = email.trim().toLowerCase();
      if (state.reason === 'expired' && state.expiresAt) {
        throw new ForbiddenException({
          message: `Your Rent Pilot subscription expired on ${formatExpiryDate(state.expiresAt)}. Renew on the pricing page to restore access.`,
          code: 'SUBSCRIPTION_REQUIRED',
          subscriptionReason: 'expired',
          email: normalized,
          expiresAt: state.expiresAt.toISOString(),
        });
      }

      throw new ForbiddenException({
        message:
          'An active subscription is required for property managers. Complete checkout on the pricing page first, using the same email as your account.',
        code: 'SUBSCRIPTION_REQUIRED',
        subscriptionReason: 'never_subscribed',
        email: normalized,
      });
    });
  }

  private inactiveState(
    reason: 'never_subscribed' | 'expired',
  ): ManagerSubscriptionState {
    return {
      active: false,
      reason,
      expiresAt: null,
      daysRemaining: null,
      expiringSoon: false,
    };
  }
}

function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function formatExpiryDate(date: Date): string {
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
