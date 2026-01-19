import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DepartmentLunchDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  regularQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vegQuantity?: number;

  @IsOptional()
  @IsString()
  departmentId?: string;
}




