import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Category } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list(@Query('category') category?: Category) {
    return this.listings.list(category);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.listings.get(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateListingDto) {
    return this.listings.create(user.userId, dto);
  }
}
