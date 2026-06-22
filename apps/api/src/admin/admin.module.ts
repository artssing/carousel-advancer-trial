import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PlatformConfigController } from './platform-config.controller';

@Module({ controllers: [AdminController, PlatformConfigController] })
export class AdminModule {}
