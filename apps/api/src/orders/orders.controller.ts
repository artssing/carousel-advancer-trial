import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOrderDto) {
    return this.orders.createFromListing(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.orders.listForUser(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.get(id, user.userId);
  }
}
