import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class SetActualDto {
  @IsDateString()
  date: string;

  @IsString()
  departmentId: string;

  @IsInt()
  @Min(0)
  actualQuantity: number;
}
