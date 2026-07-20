import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const AVATAR_MAX_BYTES = 256 * 1024; // 256 KB, matches schema comment
const AVATAR_ORIGINAL_MAX_BYTES = 512 * 1024; // 512 KB — pre-crop source

class UpdateMeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  displayName?: string;
  /** base64 data URL, e.g. "data:image/png;base64,iVBORw0..." Pass empty string to clear. */
  @IsOptional() @IsString()
  avatarUrl?: string | null;
  /** Uncompressed source so the customer can re-crop later. Empty string to clear. */
  @IsOptional() @IsString()
  avatarOriginalUrl?: string | null;
  /** Crop transform parameters (zoom 1.0–3.0, tx/ty in 200px viewport units). */
  @IsOptional()
  avatarCropZoom?: number | null;
  @IsOptional()
  avatarCropX?: number | null;
  @IsOptional()
  avatarCropY?: number | null;
  /** Register-v2 interests — Category enum values to seed personalisation. */
  @IsOptional()
  interests?: string[];
}

class ChangePasswordDto {
  @IsString() @MinLength(1)
  currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(72)
  newPassword!: string;
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: CurrentUserData) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        avatarOriginalUrl: true,
        avatarCropZoom: true,
        avatarCropX: true,
        avatarCropY: true,
        phone: true,
        phoneVerified: true,
        roles: true,
        kycStatus: true,
        createdAt: true,
        authenticator: {
          select: {
            id: true,
            displayName: true,
            storeName: true,
            categories: true,
            starRating: true,
            completedCount: true,
            disputeRate: true,
            status: true,
            feeRatePct: true,
            feeMinHKD: true,
            bio: true,
            yearsExperience: true,
            locationAddress: true,
            district: true,
            businessHours: true,
            acceptsMeetup: true,
            eAndOInsuranceExpiresAt: true,
          },
        },
      },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  /**
   * Update my own profile. Email is intentionally NOT mutable here (founder ruling 2026-06-11).
   * Q5=A: also sync Authenticator.displayName to match User.displayName.
   */
  @Patch()
  async updateMe(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMeDto) {
    const data: any = {};

    if (dto.displayName !== undefined) {
      const v = dto.displayName.trim();
      if (!v) throw new BadRequestException('顯示名稱不可為空');
      data.displayName = v;
    }

    if (dto.avatarUrl !== undefined) {
      if (dto.avatarUrl === null || dto.avatarUrl === '') {
        data.avatarUrl = null;
      } else {
        if (!dto.avatarUrl.startsWith('data:image/')) {
          throw new BadRequestException('Avatar 必須係 data:image/* base64 URL');
        }
        if (Buffer.byteLength(dto.avatarUrl, 'utf8') > AVATAR_MAX_BYTES) {
          throw new BadRequestException(`Avatar 太大（上限 ${AVATAR_MAX_BYTES / 1024}KB），請壓縮後再上傳`);
        }
        data.avatarUrl = dto.avatarUrl;
      }
    }

    // Original-source persistence — lets the customer re-open the cropper
    // with the same image, no re-upload.
    if (dto.avatarOriginalUrl !== undefined) {
      if (dto.avatarOriginalUrl === null || dto.avatarOriginalUrl === '') {
        data.avatarOriginalUrl = null;
        data.avatarCropZoom = null;
        data.avatarCropX = null;
        data.avatarCropY = null;
      } else {
        if (!dto.avatarOriginalUrl.startsWith('data:image/')) {
          throw new BadRequestException('原圖必須係 data:image/* base64 URL');
        }
        if (Buffer.byteLength(dto.avatarOriginalUrl, 'utf8') > AVATAR_ORIGINAL_MAX_BYTES) {
          throw new BadRequestException(`原圖太大（上限 ${AVATAR_ORIGINAL_MAX_BYTES / 1024}KB），請揀細啲嘅圖`);
        }
        data.avatarOriginalUrl = dto.avatarOriginalUrl;
      }
    }
    if (dto.avatarCropZoom !== undefined) data.avatarCropZoom = dto.avatarCropZoom;
    if (dto.avatarCropX !== undefined) data.avatarCropX = dto.avatarCropX;
    if (dto.avatarCropY !== undefined) data.avatarCropY = dto.avatarCropY;

    if (dto.interests !== undefined) {
      const arr = Array.isArray(dto.interests) ? dto.interests : [];
      data.interests = Array.from(new Set(arr)).slice(0, 20);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('無任何欄位更新');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.userId },
        data,
        select: {
          id: true, email: true, displayName: true, avatarUrl: true,
          avatarOriginalUrl: true, avatarCropZoom: true, avatarCropX: true, avatarCropY: true,
          roles: true, kycStatus: true, createdAt: true,
        },
      });
      // Q5=A — 統一用 User.displayName。User 改名後同步落 Authenticator.displayName。
      if (data.displayName !== undefined) {
        await tx.authenticator.updateMany({
          where: { userId: user.userId },
          data: { displayName: data.displayName },
        });
      }
      return updated;
    });
  }

  /**
   * Change password — requires currentPassword verification (Lesson #16: destructive
   * action confirm done in UI; server still verifies the secret).
   * Q1: token NOT invalidated server-side; UI will prompt "保持登入 / 重新登入".
   */
  @Patch('password')
  async changePassword(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChangePasswordDto,
  ) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, passwordHash: true },
    });
    if (!found) throw new NotFoundException('User not found');
    // SSO-only user has null passwordHash → reject changePassword (they should
    // use "set password" flow first — backlog feature).
    if (!found.passwordHash) {
      throw new BadRequestException('呢個帳戶用緊 Google 登入，未設定密碼。請先用 "設定密碼" 功能（即將推出）。');
    }
    const ok = await bcrypt.compare(dto.currentPassword, found.passwordHash);
    if (!ok) throw new UnauthorizedException('現有密碼錯誤');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('新密碼不可與舊密碼相同');
    }
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.userId },
      data: { passwordHash: newHash },
    });
    return { ok: true };
  }
}
