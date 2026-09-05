export type PricingPlanId = 'professional' | 'enterprise';

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  amountNgn: number;
  description: string;
};

export const PRICING_PLANS: Record<PricingPlanId, PricingPlan> = {
  professional: {
    id: 'professional',
    name: 'Professional',
    amountNgn: 249_000,
    description: 'Rent Pilot Professional — up to 50 units / month',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    amountNgn: 999_999,
    description: 'Rent Pilot Enterprise — unlimited units / month',
  },
};

export function isPricingPlanId(value: string): value is PricingPlanId {
  return value === 'professional' || value === 'enterprise';
}

export function getPricingPlan(planId: PricingPlanId): PricingPlan {
  return PRICING_PLANS[planId];
}
