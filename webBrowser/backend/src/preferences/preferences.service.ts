import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type PreferenceValue = Prisma.InputJsonValue;

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(userId: string, service: string, key: string): Promise<T | null> {
    const row = await this.prisma.preference.findUnique({
      where: { userId_service_key: { userId, service, key } },
      select: { value: true },
    });
    return row ? (row.value as T) : null;
  }

  async set(userId: string, service: string, key: string, value: PreferenceValue): Promise<void> {
    await this.prisma.preference.upsert({
      where: { userId_service_key: { userId, service, key } },
      create: { userId, service, key, value },
      update: { value },
    });
  }

  async delete(userId: string, service: string, key: string): Promise<void> {
    await this.prisma.preference.deleteMany({ where: { userId, service, key } });
  }

  async list(userId: string, service: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.preference.findMany({
      where: { userId, service },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
