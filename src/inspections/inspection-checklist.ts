import { InspectionItemCondition } from './inspection-condition.enum';

export type InspectionChecklistItem = {
  id: string;
  area: string;
  item: string;
  condition: InspectionItemCondition;
  notes: string;
};
