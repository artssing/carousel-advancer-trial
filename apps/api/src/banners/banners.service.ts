import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BannerAudience, BannerSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ACTIVE_BANNERS = 3;
const MAX_MESSAGE_LENGTH = 200;
const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];

/** Strip all HTML tags — plain-text only. Preserves entities as-is. */
function sanitizePlainText(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

export interface BannerListOptions {
  audience?: BannerAudience | 'ALL';
  activeOnly?: boolean;
}

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public — returns banners visible to `audience` right now. Called by
   *  consumer + authenticator apps every 60s. */
  async listPublic(audience: BannerAudience) {
    const now = new Date();
    // Server-side audience filter: viewer's audience OR ALL banners.
    const items = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        audience: { in: [audience, 'ALL'] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: MAX_ACTIVE_BANNERS,
      select: {
        id: true, message: true, severity: true, audience: true,
        dismissible: true, priority: true, createdAt: true,
      },
    });
    return items;
  }

  /** Admin — list ALL banners regardless of active/schedule. */
  async listAll(actorId: string) {
    await this.requireAdmin(actorId);
    return this.prisma.banner.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(actorId: string, dto: {
    message: string;
    severity: BannerSeverity;
    audience?: BannerAudience;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    dismissible?: boolean;
    priority?: number;
  }) {
    await this.requireAdmin(actorId);
    const message = this.validateMessage(dto.message);
    // Enforce global cap on active banners
    if (dto.isActive) await this.ensureActiveCapacity(null);
    return this.prisma.banner.create({
      data: {
        message,
        severity: dto.severity,
        audience: dto.audience ?? 'ALL',
        isActive: !!dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        dismissible: dto.dismissible ?? true,
        priority: dto.priority ?? 0,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async update(actorId: string, id: string, dto: Partial<{
    message: string;
    severity: BannerSeverity;
    audience: BannerAudience;
    isActive: boolean;
    startsAt: string | null;
    endsAt: string | null;
    dismissible: boolean;
    priority: number;
  }>) {
    await this.requireAdmin(actorId);
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');

    const data: Prisma.BannerUpdateInput = { updatedBy: actorId };
    if (dto.message !== undefined) data.message = this.validateMessage(dto.message);
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.dismissible !== undefined) data.dismissible = dto.dismissible;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.isActive !== undefined) {
      // Activation transition: enforce cap
      if (dto.isActive && !existing.isActive) await this.ensureActiveCapacity(id);
      data.isActive = dto.isActive;
    }

    return this.prisma.banner.update({ where: { id }, data });
  }

  async remove(actorId: string, id: string) {
    await this.requireAdmin(actorId);
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    await this.prisma.banner.delete({ where: { id } });
    return { ok: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private validateMessage(raw: string): string {
    const clean = sanitizePlainText(raw ?? '');
    if (!clean) throw new BadRequestException('Banner 訊息不可為空');
    if (clean.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`訊息太長（上限 ${MAX_MESSAGE_LENGTH} 字）`);
    }
    return clean;
  }

  private async ensureActiveCapacity(excludeId: string | null) {
    const activeCount = await this.prisma.banner.count({
      where: { isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (activeCount >= MAX_ACTIVE_BANNERS) {
      throw new BadRequestException(
        `已有 ${MAX_ACTIVE_BANNERS} 條 active banners（上限），請先停用其中一條`,
      );
    }
  }

  private async requireAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!u || !u.roles.some((r) => ADMIN_ROLES.includes(r))) {
      throw new ForbiddenException('需要 admin 權限');
    }
  }
}
