import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class NotifyTenantsManagerTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dueLabel?: string;

  /** If omitted, all tenants on your occupancy roster (max 200) are notified. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(150)
  @IsUUID('4', { each: true })
  tenantIds?: string[];
}
