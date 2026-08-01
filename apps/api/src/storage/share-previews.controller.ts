import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const MAX_SHARE_IMAGE_BYTES = 8 * 1024 * 1024; // generated collage PNG — comfortably under 8MB

/**
 * Magic-byte sniff. `file.mimetype` is just the client's claim, so it cannot
 * gate what actually lands in a public bucket — only the wizard's own PNG/JPEG
 * output is accepted (WebP included: some browsers' toBlob falls back to it).
 */
function sniffImageMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Social-share collage images. The consumer share modal uploads the generated
 * collage here; the returned `id` backs a public `/s/:id` page whose og:image is
 * the collage, so a Facebook/WhatsApp desktop link preview shows the composed
 * card (not just the listing's first photo). Upload requires auth (abuse
 * control); the GET is public so logged-out crawlers can read it.
 *
 * The uploader is deliberately NOT required to own the listing — a buyer
 * sharing someone else's item is the main use case. `uploaderId` is recorded
 * instead so a card that misrepresents a listing traces back to an account.
 */
@Controller('share-previews')
export class SharePreviewsController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_SHARE_IMAGE_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Body('listingId') listingId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const mimeType = sniffImageMime(file.buffer);
    if (!mimeType) throw new BadRequestException('只接受圖片檔案');
    if (!listingId) throw new BadRequestException('缺少 listingId');
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    // Sniffed type wins over the client's claim — it decides both the stored
    // Content-Type and the object key's extension.
    const stored = await this.storage.upload({ ...file, mimetype: mimeType });
    const row = await this.prisma.sharePreview.create({
      data: { imageUrl: stored.url, listingId, uploaderId: user.userId },
      select: { id: true, imageUrl: true },
    });
    return row;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.sharePreview.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, listingId: true },
    });
    if (!row) throw new NotFoundException('Share preview not found');
    return row;
  }
}
