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
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const MAX_SHARE_IMAGE_BYTES = 8 * 1024 * 1024; // generated collage PNG — comfortably under 8MB

/**
 * Social-share collage images. The consumer share modal uploads the generated
 * collage here; the returned `id` backs a public `/s/:id` page whose og:image is
 * the collage, so a Facebook/WhatsApp desktop link preview shows the composed
 * card (not just the listing's first photo). Upload requires auth (abuse
 * control); the GET is public so logged-out crawlers can read it.
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
  ) {
    if (!/^image\//.test(file.mimetype)) {
      throw new BadRequestException('只接受圖片檔案');
    }
    if (!listingId) throw new BadRequestException('缺少 listingId');
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const stored = await this.storage.upload(file);
    const row = await this.prisma.sharePreview.create({
      data: { imageUrl: stored.url, listingId },
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
