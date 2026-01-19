import { IsBoolean, IsDateString } from 'class-validator';

export class SetLockDto {
  @IsDateString()
  date: string;

  @IsBoolean()
  locked: boolean;
}



