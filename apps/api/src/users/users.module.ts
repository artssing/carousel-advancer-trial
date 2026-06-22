import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PublicUsersController } from './public-users.controller';
import { SellerReviewsController } from './seller-reviews.controller';

@Module({ controllers: [UsersController, PublicUsersController, SellerReviewsController] })
export class UsersModule {}
