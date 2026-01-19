import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type SetDepartmentInput = {
  date: string;
  departmentId: string;
  totalQuantity: number;
  updatedBy?: string | null;
};

@Injectable()
export class LunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async setDepartmentLunch(input: SetDepartmentInput) {
    const { departmentId, totalQuantity, updatedBy } = input;
    if (!departmentId) {
      throw new BadRequestException('Missing department');
    }
    if (totalQuantity < 0) {
      throw new BadRequestException('Quantity must be >= 0');
    }

    const dateValue = this.getTargetDate();
    if (await this.isLocked(dateValue)) {
      throw new ForbiddenException('Registration is locked');
    }

    const existing = await this.prisma.departmentLunch.findUnique({
      where: { departmentId_date: { departmentId, date: dateValue } },
    });

    const record = await this.prisma.departmentLunch.upsert({
      where: {
        departmentId_date: {
          departmentId,
          date: dateValue,
        },
      },
      create: {
        departmentId,
        date: dateValue,
        totalQuantity,
        updatedBy: updatedBy ?? null,
      },
      update: {
        totalQuantity,
        updatedBy: updatedBy ?? null,
      },
    });

    const shouldLog =
      !existing || existing.totalQuantity !== record.totalQuantity;
    if (shouldLog) {
      await this.prisma.departmentLunchHistory.create({
        data: {
          departmentId,
          date: dateValue,
          totalQuantity: record.totalQuantity,
          updatedBy: updatedBy ?? null,
        },
      });
    }

    const response = this.mapDepartmentLunch(record);
    this.realtimeGateway.emitLunchUpdated(response.date, {
      type: 'department',
      department: response,
    });
    return response;
  }

  async getDepartmentLunch(date: string, departmentId: string) {
    const dateValue = new Date(date);
    const record = await this.prisma.departmentLunch.findUnique({
      where: { departmentId_date: { departmentId, date: dateValue } },
    });
    if (!record) {
      return {
        date,
        departmentId,
        totalQuantity: 0,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return this.mapDepartmentLunch(record);
  }

  async listDepartmentHistory(departmentId: string, limit = 30) {
    const rows = await this.prisma.departmentLunchHistory.findMany({
      where: { departmentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.mapDepartmentLunchHistory(row));
  }

  async listAuditHistory(limit = 200) {
    const rows = await this.prisma.departmentLunchHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.mapDepartmentLunchHistory(row));
  }

  async summaryByDate(date: string) {
    const dateValue = new Date(date);
    const rows = await this.prisma.departmentLunch.findMany({
      where: { date: dateValue },
      orderBy: { departmentId: 'asc' },
    });
    const departments = rows.map((row) => ({
      departmentId: row.departmentId,
      totalQuantity: row.totalQuantity,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy ?? null,
    }));
    const totalQuantity = rows.reduce((sum, row) => sum + row.totalQuantity, 0);
    return {
      date,
      totalQuantity,
      departments,
    };
  }

  async setLock(date: string, locked: boolean, actor: string | null) {
    const dateValue = new Date(date);
    const lock = await this.prisma.lunchLock.upsert({
      where: { date: dateValue },
      create: {
        date: dateValue,
        locked,
        lockedAt: locked ? new Date() : null,
        lockedBy: locked ? actor : null,
      },
      update: {
        locked,
        lockedAt: locked ? new Date() : null,
        lockedBy: locked ? actor : null,
      },
    });

    this.realtimeGateway.emitLunchUpdated(date, {
      type: 'lock',
      lock: {
        date,
        locked: lock.locked,
        lockedAt: lock.lockedAt?.toISOString() ?? null,
        lockedBy: lock.lockedBy ?? null,
      },
    });
    return {
      date,
      locked: lock.locked,
      lockedAt: lock.lockedAt?.toISOString() ?? null,
      lockedBy: lock.lockedBy ?? null,
    };
  }

  async getLock(date: string) {
    const dateValue = new Date(date);
    const lock = await this.prisma.lunchLock.findUnique({
      where: { date: dateValue },
    });
    const timeLocked = this.isTimeLocked(dateValue);
    if (!lock) {
      return {
        date,
        locked: timeLocked,
        lockedAt: timeLocked ? this.getLockCutoff(dateValue).toISOString() : null,
        lockedBy: timeLocked ? 'system' : null,
      };
    }
    return {
      date,
      locked: lock.locked || timeLocked,
      lockedAt: lock.lockedAt?.toISOString() ?? (timeLocked ? this.getLockCutoff(dateValue).toISOString() : null),
      lockedBy: lock.lockedBy ?? (timeLocked ? 'system' : null),
    };
  }

  async isLocked(date: Date): Promise<boolean> {
    const lock = await this.prisma.lunchLock.findUnique({
      where: { date },
    });
    return (lock?.locked ?? false) || this.isTimeLocked(date);
  }

  private getTargetDate(now = new Date()) {
    const target = new Date(now);
    if (now.getHours() >= 12) {
      target.setDate(target.getDate() + 1);
    }
    target.setHours(0, 0, 0, 0);
    return target;
  }

  private getLockCutoff(date: Date) {
    const cutoff = new Date(date);
    cutoff.setHours(9, 0, 0, 0);
    return cutoff;
  }

  private isTimeLocked(date: Date) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    if (today.getTime() !== target.getTime()) {
      return false;
    }

    const hour = now.getHours();
    return hour >= 9 && hour < 12;
  }

  private mapDepartmentLunch(record: {
    id: string;
    departmentId: string;
    date: Date;
    totalQuantity: number;
    updatedAt: Date;
    updatedBy: string | null;
  }) {
    return {
      id: record.id,
      departmentId: record.departmentId,
      date: record.date.toISOString().slice(0, 10),
      totalQuantity: record.totalQuantity,
      updatedAt: record.updatedAt.toISOString(),
      updatedBy: record.updatedBy ?? null,
    };
  }

  private mapDepartmentLunchHistory(record: {
    id: string;
    departmentId: string;
    date: Date;
    totalQuantity: number;
    createdAt: Date;
    updatedBy: string | null;
  }) {
    return {
      id: record.id,
      departmentId: record.departmentId,
      date: record.date.toISOString().slice(0, 10),
      totalQuantity: record.totalQuantity,
      updatedAt: record.createdAt.toISOString(),
      updatedBy: record.updatedBy ?? null,
    };
  }
}

