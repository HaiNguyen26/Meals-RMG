import { IsDateString, IsString } from 'class-validator';

export class ClearDepartmentDto {
    @IsDateString()
    date: string;

    @IsString()
    departmentId: string;
}

