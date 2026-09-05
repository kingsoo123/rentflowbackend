export type PlanFeature = 'assistant' | 'multi_manager';

export const PROFESSIONAL_PLAN_FEATURES: readonly PlanFeature[] = [];

export const ENTERPRISE_PLAN_FEATURES: readonly PlanFeature[] = [
  'assistant',
  'multi_manager',
];

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  assistant: 'AI Assistant',
  multi_manager: 'Co-manager assignments',
};

export function planIncludesFeature(
  features: readonly PlanFeature[],
  feature: PlanFeature,
): boolean {
  return features.includes(feature);
}
