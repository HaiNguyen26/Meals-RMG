import {
    Body,
    Controller,
    Get,
    Headers,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ClearDepartmentDto } from './dto/clear-department.dto';
import { DepartmentLunchDto } from './dto/department-lunch.dto';
import { SetLockDto } from './dto/set-lock.dto';
import { LunchService } from './lunch.service';

type ActorInfo = {
    userId: string;
    userName: string;
    department: string;
    userEmail?: string;
    role: string | null;
};

@Controller('lunch')
export class LunchController {
    constructor(private readonly lunchService: LunchService) { }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('manager', 'admin', 'kitchen')
    @Get('summary')
    async summaryByDate(@Query('date') date: string) {
        return this.lunchService.summaryByDate(date);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('manager', 'admin')
    @Post('department')
    async setDepartmentLunch(
        @Body() body: DepartmentLunchDto,
        @Req() request: Request,
    ) {
        const actor = this.resolveActor({ request });
        const departmentId =
            body.departmentId && actor.role === 'admin'
                ? body.departmentId
                : actor.department;
        const regularQuantity =
            typeof body.regularQuantity === 'number'
                ? body.regularQuantity
                : typeof body.totalQuantity === 'number'
                  ? body.totalQuantity
                  : 0;
        const vegQuantity =
            typeof body.vegQuantity === 'number' ? body.vegQuantity : 0;

        return this.lunchService.setDepartmentLunch({
            date: body.date,
            departmentId,
            regularQuantity,
            vegQuantity,
            totalQuantity: regularQuantity + vegQuantity,
            updatedBy: actor.userName,
        });
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('manager', 'admin', 'kitchen')
    @Get('department')
    async getDepartmentLunch(
        @Query('date') date: string,
        @Req() request: Request,
    ) {
        const actor = this.resolveActor({ request });
        return this.lunchService.getDepartmentLunch(date, actor.department);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('manager', 'admin')
    @Get('department/history')
    async getDepartmentHistory(@Req() request: Request, @Query('limit') limit?: string) {
        const actor = this.resolveActor({ request });
        const parsedLimit = limit ? Number(limit) : 30;
        return this.lunchService.listDepartmentHistory(actor.department, parsedLimit);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('department/audit')
    async getAuditHistory(@Query('limit') limit?: string) {
        const parsedLimit = limit ? Number(limit) : 200;
        return this.lunchService.listAuditHistory(parsedLimit);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('department/clear')
    async clearDepartmentLunch(
        @Body() body: ClearDepartmentDto,
        @Req() request: Request,
    ) {
        const actor = this.resolveActor({ request });
        return this.lunchService.clearDepartmentLunch(
            body.date,
            body.departmentId,
            actor.userName,
        );
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('lock')
    async setLock(
        @Body() body: SetLockDto,
        @Req() request: Request,
        @Headers('x-user-id') userIdHeader?: string,
        @Headers('x-user-name') userNameHeader?: string,
    ) {
        const actor = this.resolveActor({
            request,
            userIdHeader,
            userNameHeader,
            departmentHeader: undefined,
            userEmailHeader: undefined,
            roleHeader: undefined,
        });
        return this.lunchService.setLock(body.date, body.locked, actor.userName);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('manager', 'admin', 'kitchen')
    @Get('lock')
    async getLock(@Query('date') date: string) {
        return this.lunchService.getLock(date);
    }

    private resolveActor({
        request,
        userIdHeader,
        userNameHeader,
        departmentHeader,
        userEmailHeader,
        roleHeader,
    }: {
        request?: Request;
        userIdHeader?: string;
        userNameHeader?: string;
        departmentHeader?: string;
        userEmailHeader?: string;
        roleHeader?: string;
    }): ActorInfo {
        const authUser = (request as (Request & { user?: ActorInfo }) | undefined)
            ?.user;
        return {
            userId: authUser?.userId ?? userIdHeader?.trim() ?? 'demo-user',
            userName: authUser?.userName ?? userNameHeader?.trim() ?? 'Nhân viên Demo',
            department:
                authUser?.department ?? departmentHeader?.trim() ?? 'Văn phòng',
            userEmail: authUser?.userEmail ?? userEmailHeader?.trim(),
            role: authUser?.role ?? roleHeader?.trim() ?? null,
        };
    }
}

