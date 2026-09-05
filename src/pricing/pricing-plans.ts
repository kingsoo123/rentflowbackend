import type { PlanFeature } from './plan-features';
import {
  ENTERPRISE_PLAN_FEATURES,
  PROFESSIONAL_PLAN_FEATURES,
} from './plan-features';

export type PricingPlanId = 'professional' | 'enterprise';

export type PlanEntitlements = {
  /** null = unlimited (Enterprise). */
  maxUnits: number | null;
  features: readonly PlanFeature[];
};

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  amountNgn: number;
  description: string;
  entitlements: PlanEntitlements;
};

export const PRICING_PLANS: Record<PricingPlanId, PricingPlan> = {
  professional: {
    id: 'professional',
    name: 'Professional',
    amountNgn: 249_000,
    description: 'Rent Pilot Professional — up to 20 units / month',
    entitlements: { maxUnits: 20, features: PROFESSIONAL_PLAN_FEATURES },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    amountNgn: 999_999,
    description: 'Rent Pilot Enterprise — unlimited units / month',
    entitlements: { maxUnits: null, features: ENTERPRISE_PLAN_FEATURES },
  },
};

export function isPricingPlanId(value: string): value is PricingPlanId {
  return value === 'professional' || value === 'enterprise';
}

export function getPricingPlan(planId: PricingPlanId): PricingPlan {
  return PRICING_PLANS[planId];
}

export function getPlanEntitlements(planId: PricingPlanId): PlanEntitlements {
  return PRICING_PLANS[planId].entitlements;
}
