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
  regularQuantity: number;
  vegQuantity: number;
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
    const { departmentId, regularQuantity, vegQuantity, totalQuantity, updatedBy } =
      input;
    if (!departmentId) {
      throw new BadRequestException('Missing department');
    }
    if (totalQuantity < 0 || regularQuantity < 0 || vegQuantity < 0) {
      throw new BadRequestException('Quantity must be >= 0');
    }

    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(input.date);
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
        regularQuantity,
        vegQuantity,
        totalQuantity,
        updatedBy: updatedBy ?? null,
      },
      update: {
        regularQuantity,
        vegQuantity,
        totalQuantity,
        updatedBy: updatedBy ?? null,
      },
    });

    const shouldLog =
      !existing ||
      existing.totalQuantity !== record.totalQuantity ||
      existing.regularQuantity !== record.regularQuantity ||
      existing.vegQuantity !== record.vegQuantity;
    if (shouldLog) {
      await this.prisma.departmentLunchHistory.create({
        data: {
          departmentId,
          date: dateValue,
          regularQuantity: record.regularQuantity,
          vegQuantity: record.vegQuantity,
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
    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(date);
    const record = await this.prisma.departmentLunch.findUnique({
      where: { departmentId_date: { departmentId, date: dateValue } },
    });
    if (!record) {
      return {
        date,
        departmentId,
        regularQuantity: 0,
        vegQuantity: 0,
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
    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(date);
    const rows = await this.prisma.departmentLunch.findMany({
      where: { date: dateValue },
      orderBy: { departmentId: 'asc' },
    });
    const departments = rows.map((row) => {
      const quantities = this.normalizeQuantities(row);
      return {
        departmentId: row.departmentId,
        regularQuantity: quantities.regularQuantity,
        vegQuantity: quantities.vegQuantity,
        totalQuantity: quantities.totalQuantity,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy ?? null,
      };
    });
    const totalQuantity = departments.reduce(
      (sum, row) => sum + row.totalQuantity,
      0,
    );
    return {
      date,
      totalQuantity,
      departments,
    };
  }

  async setLock(date: string, locked: boolean, actor: string | null) {
    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(date);
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
    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(date);
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
    const dateValue = this.normalizeDate(date);
    const lock = await this.prisma.lunchLock.findUnique({
      where: { date: dateValue },
    });
    return (lock?.locked ?? false) || this.isTimeLocked(dateValue);
  }

  async clearDepartmentLunch(
    date: string,
    departmentId: string,
    updatedBy?: string | null,
  ) {
    if (!departmentId) {
      throw new BadRequestException('Missing department');
    }
    await this.purgePastDataIfNeeded();
    const dateValue = this.normalizeDate(date);
    const record = await this.prisma.departmentLunch.upsert({
      where: { departmentId_date: { departmentId, date: dateValue } },
      create: {
        departmentId,
        date: dateValue,
        regularQuantity: 0,
        vegQuantity: 0,
        totalQuantity: 0,
        updatedBy: updatedBy ?? null,
      },
      update: {
        regularQuantity: 0,
        vegQuantity: 0,
        totalQuantity: 0,
        updatedBy: updatedBy ?? null,
      },
    });
    await this.prisma.departmentLunchHistory.create({
      data: {
        departmentId,
        date: dateValue,
        regularQuantity: 0,
        vegQuantity: 0,
        totalQuantity: 0,
        updatedBy: updatedBy ?? null,
      },
    });
    const response = this.mapDepartmentLunch(record);
    this.realtimeGateway.emitLunchUpdated(response.date, {
      type: 'department',
      department: response,
    });
    return response;
  }

  private getTargetDate(now = new Date()) {
    const target = new Date(now);
    if (now.getHours() >= 12) {
      target.setDate(target.getDate() + 1);
    }
    target.setHours(0, 0, 0, 0);
    return this.normalizeDate(target);
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

  private async purgePastDataIfNeeded(now = new Date()) {
    if (now.getHours() < 12) {
      return;
    }
    const today = this.normalizeDate(now);
    await this.prisma.departmentLunchHistory.deleteMany({
      where: { date: { lt: today } },
    });
    await this.prisma.departmentLunch.deleteMany({
      where: { date: { lt: today } },
    });
    await this.prisma.lunchLock.deleteMany({
      where: { date: { lt: today } },
    });
  }

  private normalizeDate(input: Date | string) {
    if (input instanceof Date) {
      return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
    }
    const datePart = input.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    if (!year || !month || !day) {
      throw new BadRequestException('Invalid date');
    }
    return new Date(Date.UTC(year, month - 1, day));
  }

  private mapDepartmentLunch(record: {
    id: string;
    departmentId: string;
    date: Date;
    regularQuantity: number;
    vegQuantity: number;
    totalQuantity: number;
    updatedAt: Date;
    updatedBy: string | null;
  }) {
    const quantities = this.normalizeQuantities(record);
    return {
      id: record.id,
      departmentId: record.departmentId,
      date: record.date.toISOString().slice(0, 10),
      regularQuantity: quantities.regularQuantity,
      vegQuantity: quantities.vegQuantity,
      totalQuantity: quantities.totalQuantity,
      updatedAt: record.updatedAt.toISOString(),
      updatedBy: record.updatedBy ?? null,
    };
  }

  private mapDepartmentLunchHistory(record: {
    id: string;
    departmentId: string;
    date: Date;
    regularQuantity: number;
    vegQuantity: number;
    totalQuantity: number;
    createdAt: Date;
    updatedBy: string | null;
  }) {
    const quantities = this.normalizeQuantities(record);
    return {
      id: record.id,
      departmentId: record.departmentId,
      date: record.date.toISOString().slice(0, 10),
      regularQuantity: quantities.regularQuantity,
      vegQuantity: quantities.vegQuantity,
      totalQuantity: quantities.totalQuantity,
      updatedAt: record.createdAt.toISOString(),
      updatedBy: record.updatedBy ?? null,
    };
  }

  private normalizeQuantities(record: {
    regularQuantity: number;
    vegQuantity: number;
    totalQuantity: number;
  }) {
    if (
      record.totalQuantity > 0 &&
      record.regularQuantity === 0 &&
      record.vegQuantity === 0
    ) {
      return {
        regularQuantity: record.totalQuantity,
        vegQuantity: 0,
        totalQuantity: record.totalQuantity,
      };
    }
    return {
      regularQuantity: record.regularQuantity,
      vegQuantity: record.vegQuantity,
      totalQuantity: record.totalQuantity,
    };
  }
}

