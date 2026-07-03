import { IsUUID } from 'class-validator';

export class AssignMaintenanceWorkerDto {
  @IsUUID()
  artisanUserId: string;
}
