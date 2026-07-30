import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';
import { SharePreviewsController } from './share-previews.controller';

@Module({
  controllers: [UploadsController, SharePreviewsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
