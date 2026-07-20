import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Public-read whitelist — config keys safe to expose without auth.
 *  Founder ruling 2026-06-11: client (sell page) needs to fetch
 *  `videoUploadEnabled` to decide whether to render the upload button.
 */
const PUBLIC_KEYS = new Set([
  'videoUploadEnabled',
  'payoutFeeHKD',
  // Login-method feature toggles — read by the public login page to decide
  // which OAuth buttons to render. Apple flow is NOT built yet (kept off).
  'authGoogleEnabled',
  'authAppleEnabled',
]);

@Controller('platform-config')
export class PlatformConfigController {
  constructor(private readonly prisma: PrismaService) {}

  /** Read a single config value. Public, no auth required. */
  @Get(':key')
  async get(@Param('key') key: string) {
    if (!PUBLIC_KEYS.has(key)) {
      throw new NotFoundException('Config key not found');
    }
    const row = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!row) {
      // Default-off semantics for feature toggles
      return { key, value: key.endsWith('Enabled') ? { enabled: false } : null };
    }
    return row;
  }
}
