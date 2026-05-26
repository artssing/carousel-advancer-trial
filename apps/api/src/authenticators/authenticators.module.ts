import { Module } from '@nestjs/common';
import { AuthenticatorsController } from './authenticators.controller';

@Module({ controllers: [AuthenticatorsController] })
export class AuthenticatorsModule {}
