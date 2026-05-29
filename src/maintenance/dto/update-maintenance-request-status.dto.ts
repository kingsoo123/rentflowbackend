import { IsEnum } from 'class-validator';
import { MaintenanceRequestStatus } from '../maintenance-request-status.enum';

export class UpdateMaintenanceRequestStatusDto {
  @IsEnum(MaintenanceRequestStatus)
  status: MaintenanceRequestStatus;
}
