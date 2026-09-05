import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../properties/property.entity';
import { PropertyUnit } from '../properties/property-unit.entity';
import { PricingCheckout } from '../pricing/pricing-checkout.entity';
import { PricingCheckoutStatus } from '../pricing/pricing-checkout-status.enum';
import {
  getPlanEntitlements,
  getPricingPlan,
  isPricingPlanId,
  type PlanEntitlements,
  type PricingPlanId,
} from '../pricing/pricing-plans';
import {
  PLAN_FEATURE_LABELS,
  planIncludesFeature,
  type PlanFeature,
} from '../pricing/plan-features';

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

export type ManagerSubscriptionUsage = {
  unitCount: number;
  propertyCount: number;
};

export type ManagerSubscriptionDetail = ManagerSubscriptionState & {
  planId: PricingPlanId | null;
  planName: string | null;
  entitlements: PlanEntitlements;
  usage: ManagerSubscriptionUsage;
};

@Injectable()
export class PropertyManagerSubscriptionService {
  constructor(
    @InjectRepository(PricingCheckout)
    private readonly checkoutsRepository: Repository<PricingCheckout>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(PropertyUnit)
    private readonly unitRepository: Repository<PropertyUnit>,
  ) {}

  async getSubscriptionStateForEmail(
    email: string,
  ): Promise<ManagerSubscriptionState> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return this.inactiveState('never_subscribed');
    }

    const latest = await this.findLatestSuccessfulCheckout(normalized);

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

  async getManagerSubscriptionDetail(
    email: string,
    managerUserId: string,
  ): Promise<ManagerSubscriptionDetail> {
    const state = await this.getSubscriptionStateForEmail(email);
    const normalized = email.trim().toLowerCase();
    const latest = normalized
      ? await this.findLatestSuccessfulCheckout(normalized)
      : null;

    let planId: PricingPlanId | null = null;
    let planName: string | null = null;
    let entitlements: PlanEntitlements = { maxUnits: null, features: [] };

    if (latest && isPricingPlanId(latest.planId)) {
      planId = latest.planId;
      planName = latest.planName?.trim() || getPricingPlan(planId).name;
      entitlements = getPlanEntitlements(planId);
    }

    const usage = await this.getUsageForManager(managerUserId);

    return {
      ...state,
      planId,
      planName,
      entitlements,
      usage,
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

  async assertCanAddUnit(email: string, managerUserId: string): Promise<void> {
    const detail = await this.getManagerSubscriptionDetail(email, managerUserId);
    if (!detail.active) {
      await this.assertPropertyManagerHasPaid(email);
      return;
    }

    const maxUnits = detail.entitlements.maxUnits;
    if (maxUnits == null) {
      return;
    }

    if (detail.usage.unitCount >= maxUnits) {
      throw new ForbiddenException({
        message: `Your ${detail.planName ?? 'current'} plan allows up to ${maxUnits} units. Upgrade to Enterprise for unlimited units.`,
        code: 'PLAN_LIMIT_REACHED',
        limit: 'units',
        maxUnits,
        unitCount: detail.usage.unitCount,
        planId: detail.planId,
      });
    }
  }

  async assertHasFeature(
    email: string,
    managerUserId: string,
    feature: PlanFeature,
  ): Promise<void> {
    const detail = await this.getManagerSubscriptionDetail(email, managerUserId);
    if (!detail.active) {
      await this.assertPropertyManagerHasPaid(email);
      return;
    }

    if (planIncludesFeature(detail.entitlements.features, feature)) {
      return;
    }

    const label = PLAN_FEATURE_LABELS[feature];
    throw new ForbiddenException({
      message: `${label} is included on Enterprise. Upgrade to unlock this feature.`,
      code: 'PLAN_FEATURE_UNAVAILABLE',
      feature,
      planId: detail.planId,
    });
  }

  private async findLatestSuccessfulCheckout(
    normalizedEmail: string,
  ): Promise<PricingCheckout | null> {
    return this.checkoutsRepository.findOne({
      where: {
        customerEmail: normalizedEmail,
        status: PricingCheckoutStatus.SUCCESSFUL,
      },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private async getUsageForManager(
    managerUserId: string,
  ): Promise<ManagerSubscriptionUsage> {
    const [unitCount, propertyCount] = await Promise.all([
      this.countUnitsForManager(managerUserId),
      this.countPropertiesForManager(managerUserId),
    ]);
    return { unitCount, propertyCount };
  }

  private async countUnitsForManager(managerUserId: string): Promise<number> {
    return this.unitRepository
      .createQueryBuilder('u')
      .innerJoin(Property, 'p', 'p.id = u.propertyId')
      .where('p.managerUserId = :managerUserId', { managerUserId })
      .getCount();
  }

  private async countPropertiesForManager(managerUserId: string): Promise<number> {
    return this.propertyRepository.count({ where: { managerUserId } });
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
