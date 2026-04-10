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
  private static readonly LOCK_TIMEZONE = 'Asia/Ho_Chi_Minh';

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async setDepartmentLunch(input: SetDepartmentInput) {
    const {
      departmentId,
      regularQuantity,
      vegQuantity,
      totalQuantity,
      updatedBy,
    } = input;
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
        actualQuantity: 0,
        actualUpdatedAt: null,
        actualUpdatedBy: null,
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

  async listAuditHistory(options: {
    limit?: number;
    month?: string;
    date?: string;
  }) {
    let where:
      | { date: Date }
      | { date: { gte: Date; lt: Date } }
      | undefined;
    if (options.date?.trim()) {
      where = { date: this.normalizeDate(options.date.trim()) };
    } else if (options.month?.trim()) {
      const start = this.parseMonthStart(options.month.trim());
      const end = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
      );
      where = { date: { gte: start, lt: end } };
    }
    const scoped = where !== undefined;
    const take = scoped
      ? 20_000
      : Math.min(Math.max(options.limit ?? 200, 1), 2000);
    const rows = await this.prisma.departmentLunchHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
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
        actualQuantity: row.actualQuantity,
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
      totalActualQuantity: departments.reduce(
        (sum, row) => sum + row.actualQuantity,
        0,
      ),
      departments,
    };
  }

  async setActualLunch(
    date: string,
    departmentId: string,
    actualQuantity: number,
    updatedBy?: string | null,
  ) {
    if (!departmentId) {
      throw new BadRequestException('Missing department');
    }
    if (actualQuantity < 0) {
      throw new BadRequestException('Actual quantity must be >= 0');
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
        actualQuantity,
        actualUpdatedAt: new Date(),
        actualUpdatedBy: updatedBy ?? null,
      },
      update: {
        actualQuantity,
        actualUpdatedAt: new Date(),
        actualUpdatedBy: updatedBy ?? null,
      },
    });
    const response = this.mapDepartmentLunch(record);
    this.realtimeGateway.emitLunchUpdated(response.date, {
      type: 'department',
      department: response,
    });
    return response;
  }

  async monthlySummary(month: string) {
    const startDate = this.parseMonthStart(month);
    const endDate = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1),
    );
    const rows = await this.prisma.departmentLunch.findMany({
      where: {
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });
    const map = new Map<
      string,
      {
        departmentId: string;
        registeredTotal: number;
        actualTotal: number;
        variance: number;
      }
    >();
    for (const row of rows) {
      const quantities = this.normalizeQuantities(row);
      const current = map.get(row.departmentId) ?? {
        departmentId: row.departmentId,
        registeredTotal: 0,
        actualTotal: 0,
        variance: 0,
      };
      current.registeredTotal += quantities.totalQuantity;
      current.actualTotal += row.actualQuantity ?? 0;
      current.variance = current.registeredTotal - current.actualTotal;
      map.set(row.departmentId, current);
    }
    return Array.from(map.values()).sort(
      (a, b) => Math.abs(b.variance) - Math.abs(a.variance),
    );
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
        lockedAt: timeLocked
          ? this.getLockCutoff(dateValue).toISOString()
          : null,
        lockedBy: timeLocked ? 'system' : null,
      };
    }
    return {
      date,
      locked: lock.locked || timeLocked,
      lockedAt:
        lock.lockedAt?.toISOString() ??
        (timeLocked ? this.getLockCutoff(dateValue).toISOString() : null),
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
    const target = this.parseDateKey(this.getDateKey(now));
    if (this.getHour(now) >= 12) {
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
    if (process.env.DISABLE_TIME_LOCK === 'true') {
      return false;
    }
    const now = new Date();
    const targetDate = date.toISOString().slice(0, 10);
    if (this.getDateKey(now) !== targetDate) {
      return false;
    }

    const hour = this.getHour(now);
    return hour >= 9 && hour < 12;
  }

  private async purgePastDataIfNeeded(now = new Date()) {
    if (this.getHour(now) < 12) {
      return;
    }
    const today = this.normalizeDate(this.getDateKey(now));
    // Giữ DepartmentLunchHistory để tra cứu lịch sử đăng ký theo tháng (kitchen / audit).
    await this.prisma.departmentLunch.deleteMany({
      where: { date: { lt: today } },
    });
    await this.prisma.lunchLock.deleteMany({
      where: { date: { lt: today } },
    });
  }

  private normalizeDate(input: Date | string) {
    if (input instanceof Date) {
      return new Date(
        Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()),
      );
    }
    const datePart = input.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    if (!year || !month || !day) {
      throw new BadRequestException('Invalid date');
    }
    return new Date(Date.UTC(year, month - 1, day));
  }

  private getDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LunchService.LOCK_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) {
      throw new BadRequestException('Cannot resolve current date');
    }
    return `${year}-${month}-${day}`;
  }

  private getHour(date: Date) {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: LunchService.LOCK_TIMEZONE,
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .find((part) => part.type === 'hour')?.value;
    const parsed = Number(hour);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('Cannot resolve current hour');
    }
    return parsed;
  }

  private parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private parseMonthStart(month: string) {
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number(yearRaw);
    const monthValue = Number(monthRaw);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthValue) ||
      monthValue < 1 ||
      monthValue > 12
    ) {
      throw new BadRequestException('Invalid month format. Use YYYY-MM');
    }
    return new Date(Date.UTC(year, monthValue - 1, 1));
  }

  private mapDepartmentLunch(record: {
    id: string;
    departmentId: string;
    date: Date;
    regularQuantity: number;
    vegQuantity: number;
    totalQuantity: number;
    actualQuantity: number;
    actualUpdatedAt: Date | null;
    actualUpdatedBy: string | null;
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
      actualQuantity: record.actualQuantity,
      actualUpdatedAt: record.actualUpdatedAt?.toISOString() ?? null,
      actualUpdatedBy: record.actualUpdatedBy ?? null,
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
