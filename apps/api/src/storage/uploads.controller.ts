import {
  BadRequestException,
  Controller,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from './storage.service';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB ceiling — matches evidence-upload proposal video cap
const ALLOWED_MIME = /^(image|video)\//;

/**
 * Generic authenticated media upload endpoint. Used by:
 *   - Authenticator verdict-evidence upload (apps/authenticator workbench)
 *   - (future) consumer sell-flow listing media, once migrated off base64 inline
 *
 * Multipart upload, NOT JSON — keeps main.ts's 50MB JSON body limit
 * (documented there as listing-images-only) from also having to cover video,
 * per the backlog note already in main.ts.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      throw new BadRequestException('只接受圖片或影片檔案');
    }
    return this.storage.upload(file);
  }
}
